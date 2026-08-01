//! # Stellance Escrow Contract
//!
//! Soroban smart contract for trustless freelance payment escrow on Stellar.
//!
//! ## Architecture
//!
//! One contract instance is deployed per Stellance environment (testnet / mainnet).
//! Each freelance contract maps to a persistent [`EscrowEntry`] keyed by the
//! off-chain `contract_id` (a short identifier derived from the PostgreSQL UUID —
//! see the backend's `contractIdToSymbol` helper).
//!
//! ## Escrow state machine
//!
//! ```text
//!  fund()          release() / refund()
//!  ──────►  Funded ──────────────────► Released / Refunded
//!                 ─── dispute() ──────► Disputed
//!                                           │
//!                          resolve_dispute() (admin only)
//!                                           │
//!                     Released / Refunded / Resolved (split)
//! ```
//!
//! ## Why Soroban (not multisig)?
//!
//! A Stellar multisig escrow requires the platform to hold a signing key —
//! making the platform a custodian. A Soroban contract makes the rules *code*:
//! neither the client, the freelancer, nor the platform can move funds except
//! through the defined paths below.
//!
//! ## Per-milestone payments
//!
//! A single `EscrowEntry` holds the *total* contract amount. Each call to
//! `release_milestone` atomically transfers one milestone's amount and records
//! it in the released_amount accumulator so it cannot be double-released.
//! The full `release` function releases all remaining funds in one call.
//!
//! ## Stellar-specific design choices
//!
//! - Funds are held as a Stellar asset (XLM native or any SEP-41 token).
//!   `token` is the contract address of the asset; for XLM use the
//!   wrapped native XLM contract on testnet.
//! - Fees are paid by the transaction submitter (client on `fund`, platform on
//!   `release`/`refund`).  Stellar fees are ~0.00001 XLM — negligible.
//! - All state transitions emit Soroban events so the backend can subscribe
//!   via Horizon RPC event streaming rather than polling.
//! - `resolve_dispute` supports a fractional split (basis points) enabling
//!   partial refunds — not possible with a simple multisig approach.
//!
//! ## contract_id encoding
//!
//! Soroban `Symbol` is limited to 32 characters. PostgreSQL UUIDs are 36
//! characters (with hyphens), so raw UUIDs cannot be used as Symbol keys.
//! The backend truncates hyphens and uses the first 32 hex characters of the
//! UUID as the on-chain key. See `contractIdToSymbol` in
//! `stellance/backend/src/escrow/escrow.service.ts`.
//!
//! ## Build
//!
//! ```bash
//! cargo build --target wasm32-unknown-unknown --release
//! ```
//!
//! ## Deploy to testnet
//!
//! ```bash
//! stellar contract deploy \
//!   --wasm target/wasm32-unknown-unknown/release/stellance_contract.wasm \
//!   --source <admin-secret-key> \
//!   --network testnet
//! ```

// Soroban contracts can declare #![no_std] but it is not required — the
// wasm32-unknown-unknown target's std is a thin shim and the SDK works
// either way. We omit it here because the soroban-sdk 21.x testutils
// #[contracttype] derive (Arbitrary) requires std to be in scope.

use soroban_sdk::{
    contract, contractimpl, contracterror, contracttype, token::TokenClient, Address, Env, Symbol,
};

// ---------------------------------------------------------------------------
// Data types
// ---------------------------------------------------------------------------

/// Namespaced storage key.
///
/// Using a typed enum prevents collisions if more storage types are added
/// in the future (e.g. contract-level config, fee accumulator).
#[contracttype]
pub enum DataKey {
    Escrow(Symbol),
}

/// Status of an escrow entry.
#[contracttype]
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum EscrowStatus {
    /// Funds are locked — milestones can be released.
    Funded,
    /// All funds have been released to the freelancer.
    Released,
    /// All funds have been returned to the client.
    Refunded,
    /// Funds are frozen pending admin arbitration.
    Disputed,
    /// Dispute resolved via a split: some funds went to the freelancer,
    /// the remainder to the client. Neither `Released` nor `Refunded` fully
    /// describes this outcome.
    Resolved,
}

/// Persistent on-chain record for one freelance contract.
#[contracttype]
#[derive(Clone)]
pub struct EscrowEntry {
    /// Stellar address of the client who funded the escrow.
    pub client: Address,
    /// Stellar address of the freelancer who will receive payments.
    pub freelancer: Address,
    /// Total escrowed amount in the token's base unit (stroops for XLM).
    pub total_amount: i128,
    /// Amount already released to the freelancer via milestone releases.
    pub released_amount: i128,
    /// SEP-41 token contract address (use wrapped native XLM for XLM).
    pub token: Address,
    /// Current escrow state.
    pub status: EscrowStatus,
    /// Platform admin address — the only account allowed to call
    /// `resolve_dispute` and to co-authorise `release`/`refund`.
    pub admin: Address,
}

/// Decision options when an admin resolves a dispute.
#[contracttype]
#[derive(Clone, PartialEq, Eq, Debug)]
pub enum DisputeDecision {
    /// Transfer all remaining funds to the freelancer.
    ReleaseToFreelancer,
    /// Return all remaining funds to the client.
    RefundToClient,
    /// Split remaining funds; `freelancer_bps` basis points go to the
    /// freelancer, the rest return to the client.
    Split,
}

/// Error codes returned by the escrow contract.
///
/// `#[contracterror]` generates the `From<EscrowError> for soroban_sdk::Error`
/// and `From<soroban_sdk::Error> for EscrowError` impls required by
/// `#[contractimpl]` when contract functions return `Result<_, EscrowError>`.
#[contracterror]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[repr(u32)]
pub enum EscrowError {
    /// No escrow entry found for the given contract_id.
    NotFound = 1,
    /// An escrow entry for this contract_id already exists.
    AlreadyFunded = 2,
    /// The escrow is not in the expected state for this operation.
    InvalidState = 3,
    /// The caller is not authorised to perform this operation.
    Unauthorized = 4,
    /// A split resolution must have freelancer_bps in [0, 10_000].
    InvalidSplitBps = 5,
    /// Arithmetic overflow — should not occur with normal amounts.
    Overflow = 6,
    /// amount must be greater than zero.
    InvalidAmount = 7,
}

// ---------------------------------------------------------------------------
// Storage TTL
// ---------------------------------------------------------------------------

/// Extend-to target: ~1 year in ledgers (5 s/ledger on mainnet).
///
/// Soroban persistent storage entries have a finite on-chain lifetime. Without
/// periodic extension a funded escrow entry would eventually be evicted and
/// the locked funds made unrecoverable. Every write that touches persistent
/// storage must call `extend_ttl` so the entry's lifetime is refreshed to
/// at least `TTL_EXTEND_TO` ledgers from now, provided the remaining TTL is
/// below `TTL_EXTEND_IF_BELOW`.
const TTL_EXTEND_TO: u32 = 2_076_480; // ≈1 year  @ 5 s/ledger
const TTL_EXTEND_IF_BELOW: u32 = 518_400; // ≈30 days @ 5 s/ledger

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct StellanceEscrow;

#[contractimpl]
impl StellanceEscrow {
    // -----------------------------------------------------------------------
    // fund — lock client funds into escrow
    // -----------------------------------------------------------------------

    /// Lock `amount` tokens from `client` into escrow for `contract_id`.
    ///
    /// - Caller must be `client` (Soroban authorization enforced).
    /// - `admin` is set at fund time and cannot be changed.
    /// - Reverts if an escrow entry already exists for `contract_id`.
    /// - `amount` must be greater than zero.
    /// - The client must have previously approved this contract as a spender
    ///   for at least `amount` tokens via the token's `approve()` function.
    ///
    /// ## contract_id
    ///
    /// Must be a valid Soroban Symbol (≤32 characters, `[a-zA-Z0-9_]`).
    /// The backend passes the first 32 hex characters of the UUID with hyphens
    /// stripped. See `contractIdToSymbol` in the backend's EscrowService.
    pub fn fund(
        env: Env,
        contract_id: Symbol,
        client: Address,
        freelancer: Address,
        admin: Address,
        amount: i128,
        token: Address,
    ) -> Result<(), EscrowError> {
        // Require client signature — Soroban native auth enforcement
        client.require_auth();

        // Guard: amount must be positive
        if amount <= 0 {
            return Err(EscrowError::InvalidAmount);
        }

        let key = DataKey::Escrow(contract_id.clone());

        // Guard: no double-funding
        if env.storage().persistent().has(&key) {
            return Err(EscrowError::AlreadyFunded);
        }

        // Pull tokens from client into this contract via transfer_from.
        // The client must have called token.approve(escrow_contract, amount, expiry) first.
        TokenClient::new(&env, &token).transfer_from(
            &env.current_contract_address(), // spender = this contract
            &client,                          // from
            &env.current_contract_address(), // to = this contract
            &amount,
        );

        let entry = EscrowEntry {
            client: client.clone(),
            freelancer: freelancer.clone(),
            total_amount: amount,
            released_amount: 0,
            token: token.clone(),
            status: EscrowStatus::Funded,
            admin: admin.clone(),
        };

        env.storage().persistent().set(&key, &entry);

        // Extend TTL so the new entry survives for at least ~1 year.
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_EXTEND_IF_BELOW, TTL_EXTEND_TO);

        // Emit event for backend Horizon RPC streaming
        env.events().publish(
            (Symbol::new(&env, "fund"), contract_id),
            (client, freelancer, amount, token),
        );

        Ok(())
    }

    // -----------------------------------------------------------------------
    // release_milestone — partial release for a single approved milestone
    // -----------------------------------------------------------------------

    /// Release `milestone_amount` to the freelancer for one approved milestone.
    ///
    /// - Must be called by `client` or `admin`.
    /// - Escrow must be in `Funded` state.
    /// - `milestone_amount` must not exceed the remaining unreleased amount.
    /// - When the last token is released the entry transitions to `Released`.
    pub fn release_milestone(
        env: Env,
        contract_id: Symbol,
        caller: Address,
        milestone_amount: i128,
    ) -> Result<(), EscrowError> {
        caller.require_auth();

        let key = DataKey::Escrow(contract_id.clone());
        let mut entry: EscrowEntry = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(EscrowError::NotFound)?;

        // Only funded escrows can release
        if entry.status != EscrowStatus::Funded {
            return Err(EscrowError::InvalidState);
        }

        // Only the client or the admin can release funds
        if caller != entry.client && caller != entry.admin {
            return Err(EscrowError::Unauthorized);
        }

        let remaining = entry
            .total_amount
            .checked_sub(entry.released_amount)
            .ok_or(EscrowError::Overflow)?;

        // Zero / negative amount is a caller error, not a state error.
        if milestone_amount <= 0 {
            return Err(EscrowError::InvalidAmount);
        }

        if milestone_amount > remaining {
            return Err(EscrowError::InvalidState);
        }

        // Transfer milestone amount to freelancer
        TokenClient::new(&env, &entry.token).transfer(
            &env.current_contract_address(),
            &entry.freelancer,
            &milestone_amount,
        );

        entry.released_amount = entry
            .released_amount
            .checked_add(milestone_amount)
            .ok_or(EscrowError::Overflow)?;

        // If everything has been paid out, mark as fully released
        if entry.released_amount >= entry.total_amount {
            entry.status = EscrowStatus::Released;
        }

        env.storage().persistent().set(&key, &entry);

        // Refresh TTL so active entries don't expire.
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_EXTEND_IF_BELOW, TTL_EXTEND_TO);

        env.events().publish(
            (Symbol::new(&env, "release_ms"), contract_id),
            (entry.freelancer.clone(), milestone_amount, entry.released_amount),
        );

        Ok(())
    }

    // -----------------------------------------------------------------------
    // release — release ALL remaining escrowed funds to the freelancer
    // -----------------------------------------------------------------------

    /// Release the full remaining balance to the freelancer.
    ///
    /// Use `release_milestone` for per-milestone payments. This is a
    /// convenience for single-payment contracts or final settlement.
    pub fn release(
        env: Env,
        contract_id: Symbol,
        caller: Address,
    ) -> Result<(), EscrowError> {
        caller.require_auth();

        let key = DataKey::Escrow(contract_id.clone());
        let mut entry: EscrowEntry = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(EscrowError::NotFound)?;

        if entry.status != EscrowStatus::Funded {
            return Err(EscrowError::InvalidState);
        }

        if caller != entry.client && caller != entry.admin {
            return Err(EscrowError::Unauthorized);
        }

        let remaining = entry
            .total_amount
            .checked_sub(entry.released_amount)
            .ok_or(EscrowError::Overflow)?;

        if remaining > 0 {
            TokenClient::new(&env, &entry.token).transfer(
                &env.current_contract_address(),
                &entry.freelancer,
                &remaining,
            );
        }

        entry.released_amount = entry.total_amount;
        entry.status = EscrowStatus::Released;
        env.storage().persistent().set(&key, &entry);

        // Refresh TTL — the entry is now terminal but must remain readable
        // so that off-chain indexers can verify the final state.
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_EXTEND_IF_BELOW, TTL_EXTEND_TO);

        env.events().publish(
            (Symbol::new(&env, "release"), contract_id),
            (entry.freelancer.clone(), remaining),
        );

        Ok(())
    }

    // -----------------------------------------------------------------------
    // refund — return all funds to the client
    // -----------------------------------------------------------------------

    /// Return all escrowed funds to the client.
    ///
    /// - Must be called by `freelancer` or `admin`.
    /// - Escrow must be in `Funded` state.
    ///   An admin can refund a `Disputed` escrow via `resolve_dispute`.
    pub fn refund(
        env: Env,
        contract_id: Symbol,
        caller: Address,
    ) -> Result<(), EscrowError> {
        caller.require_auth();

        let key = DataKey::Escrow(contract_id.clone());
        let mut entry: EscrowEntry = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(EscrowError::NotFound)?;

        if entry.status != EscrowStatus::Funded {
            return Err(EscrowError::InvalidState);
        }

        if caller != entry.freelancer && caller != entry.admin {
            return Err(EscrowError::Unauthorized);
        }

        let remaining = entry
            .total_amount
            .checked_sub(entry.released_amount)
            .ok_or(EscrowError::Overflow)?;

        if remaining > 0 {
            TokenClient::new(&env, &entry.token).transfer(
                &env.current_contract_address(),
                &entry.client,
                &remaining,
            );
        }

        entry.status = EscrowStatus::Refunded;
        env.storage().persistent().set(&key, &entry);

        // Refresh TTL — keep the terminal record readable for audit purposes.
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_EXTEND_IF_BELOW, TTL_EXTEND_TO);

        env.events().publish(
            (Symbol::new(&env, "refund"), contract_id),
            (entry.client.clone(), remaining),
        );

        Ok(())
    }

    // -----------------------------------------------------------------------
    // dispute — freeze funds pending admin review
    // -----------------------------------------------------------------------

    /// Mark the escrow as disputed, freezing all fund movements.
    ///
    /// - Must be called by `client` or `freelancer`.
    /// - Escrow must be in `Funded` state.
    /// - After this call only `resolve_dispute` (admin-only) can move funds.
    pub fn dispute(
        env: Env,
        contract_id: Symbol,
        caller: Address,
    ) -> Result<(), EscrowError> {
        caller.require_auth();

        let key = DataKey::Escrow(contract_id.clone());
        let mut entry: EscrowEntry = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(EscrowError::NotFound)?;

        if entry.status != EscrowStatus::Funded {
            return Err(EscrowError::InvalidState);
        }

        if caller != entry.client && caller != entry.freelancer {
            return Err(EscrowError::Unauthorized);
        }

        entry.status = EscrowStatus::Disputed;
        env.storage().persistent().set(&key, &entry);

        // Refresh TTL — disputed escrows may take time to resolve; keep alive.
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_EXTEND_IF_BELOW, TTL_EXTEND_TO);

        env.events().publish(
            (Symbol::new(&env, "dispute"), contract_id),
            (caller,),
        );

        Ok(())
    }

    // -----------------------------------------------------------------------
    // resolve_dispute — admin-only arbitration with optional split
    // -----------------------------------------------------------------------

    /// Resolve a disputed escrow.
    ///
    /// Only the `admin` address set at `fund` time can call this.
    ///
    /// `decision`:
    /// - `ReleaseToFreelancer` — 100% to freelancer → status `Released`
    /// - `RefundToClient`      — 100% to client     → status `Refunded`
    /// - `Split`               — `freelancer_bps` basis points (0–10_000) to
    ///                           freelancer, remainder to client → status `Resolved`
    ///
    /// Both transfers in a `Split` happen in the same Soroban invocation,
    /// making the split **atomic** — enforced by the VM, not by trust.
    /// This is a concrete capability that Stellar multisig cannot provide.
    pub fn resolve_dispute(
        env: Env,
        contract_id: Symbol,
        caller: Address,
        decision: DisputeDecision,
        freelancer_bps: u32, // ignored unless decision == Split
    ) -> Result<(), EscrowError> {
        caller.require_auth();

        let key = DataKey::Escrow(contract_id.clone());
        let mut entry: EscrowEntry = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(EscrowError::NotFound)?;

        if entry.status != EscrowStatus::Disputed {
            return Err(EscrowError::InvalidState);
        }

        if caller != entry.admin {
            return Err(EscrowError::Unauthorized);
        }

        let remaining = entry
            .total_amount
            .checked_sub(entry.released_amount)
            .ok_or(EscrowError::Overflow)?;

        let token_client = TokenClient::new(&env, &entry.token);

        match decision {
            DisputeDecision::ReleaseToFreelancer => {
                if remaining > 0 {
                    token_client.transfer(
                        &env.current_contract_address(),
                        &entry.freelancer,
                        &remaining,
                    );
                }
                entry.status = EscrowStatus::Released;
            }
            DisputeDecision::RefundToClient => {
                if remaining > 0 {
                    token_client.transfer(
                        &env.current_contract_address(),
                        &entry.client,
                        &remaining,
                    );
                }
                entry.status = EscrowStatus::Refunded;
            }
            DisputeDecision::Split => {
                if freelancer_bps > 10_000 {
                    return Err(EscrowError::InvalidSplitBps);
                }

                // Integer arithmetic: (remaining * bps) / 10_000
                let freelancer_amount = remaining
                    .checked_mul(i128::from(freelancer_bps))
                    .ok_or(EscrowError::Overflow)?
                    / 10_000_i128;
                let client_amount = remaining
                    .checked_sub(freelancer_amount)
                    .ok_or(EscrowError::Overflow)?;

                // Both transfers in the same Soroban invocation — atomic.
                if freelancer_amount > 0 {
                    token_client.transfer(
                        &env.current_contract_address(),
                        &entry.freelancer,
                        &freelancer_amount,
                    );
                }
                if client_amount > 0 {
                    token_client.transfer(
                        &env.current_contract_address(),
                        &entry.client,
                        &client_amount,
                    );
                }
                // Split is neither a full release nor a full refund.
                // EscrowStatus::Resolved accurately describes this outcome so
                // that get_escrow() callers can distinguish it from the other
                // two terminal states.
                entry.status = EscrowStatus::Resolved;
            }
        }

        env.storage().persistent().set(&key, &entry);

        // Refresh TTL — keep the resolved record readable for audit purposes.
        env.storage()
            .persistent()
            .extend_ttl(&key, TTL_EXTEND_IF_BELOW, TTL_EXTEND_TO);

        env.events().publish(
            (Symbol::new(&env, "resolve"), contract_id),
            (decision, freelancer_bps),
        );

        Ok(())
    }

    // -----------------------------------------------------------------------
    // get_escrow — read-only view (no auth required)
    // -----------------------------------------------------------------------

    /// Return the current state of an escrow entry.
    ///
    /// Returns `None` if no entry exists for `contract_id`.
    /// The backend and frontend can call this to verify on-chain state
    /// without relying solely on their own database records.
    pub fn get_escrow(env: Env, contract_id: Symbol) -> Option<EscrowEntry> {
        env.storage()
            .persistent()
            .get(&DataKey::Escrow(contract_id))
    }

    // -----------------------------------------------------------------------
    // version — upgrade management entrypoint
    // -----------------------------------------------------------------------

    /// Return the current contract version as a Soroban String.
    ///
    /// Callers can use this to confirm which WASM build is deployed after an
    /// upgrade (via `stellar contract deploy --upgrade`). The format follows
    /// semver: `"MAJOR.MINOR.PATCH"`. Bump the minor version when new
    /// entrypoints are added in a backward-compatible way, and the major
    /// version when storage layout or argument order changes.
    ///
    /// Returns a `soroban_sdk::String` (not a Rust `&str`) because all
    /// Soroban contract return values must be `Val`-convertible.
    ///
    /// This function does not modify storage and does not require auth.
    pub fn version(env: Env) -> soroban_sdk::String {
        soroban_sdk::String::from_str(&env, "1.1.0")
    }

    // -----------------------------------------------------------------------
    // get_admin — read the admin address of a funded escrow
    // -----------------------------------------------------------------------

    /// Return the admin address recorded for `contract_id`, or `None` if the
    /// escrow does not exist.
    ///
    /// Useful for frontends and monitoring tools that need to verify which
    /// platform account has arbitration rights over a given escrow without
    /// fetching the full `EscrowEntry`.
    ///
    /// This function does not modify storage and does not require auth.
    pub fn get_admin(env: Env, contract_id: Symbol) -> Option<Address> {
        env.storage()
            .persistent()
            .get::<DataKey, EscrowEntry>(&DataKey::Escrow(contract_id))
            .map(|entry| entry.admin)
    }

    // -----------------------------------------------------------------------
    // ping — CI smoke test
    // -----------------------------------------------------------------------

    /// Emit a ping event. Used in CI to verify the contract builds and
    /// on-chain event publishing works end-to-end.
    pub fn ping(env: Env) {
        env.events()
            .publish((Symbol::new(&env, "ping"),), ());
    }
}
