#![cfg(test)]

extern crate std;

use soroban_sdk::{
    testutils::Address as _,
    token::{StellarAssetClient, TokenClient},
    Address, Env, Symbol,
};

use stellance_contract::{
    DisputeDecision, EscrowError, EscrowStatus, StellanceEscrow, StellanceEscrowClient,
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

struct Fixture {
    env: Env,
    escrow_id: Address,
    contract_id: Symbol,
    client: Address,
    freelancer: Address,
    admin: Address,
    token_addr: Address,
}

impl Fixture {
    fn setup() -> Self {
        let env = Env::default();
        env.mock_all_auths();

        // 21.x API: register_contract
        let escrow_id = env.register_contract(None, StellanceEscrow);

        let client_addr = Address::generate(&env);
        let freelancer_addr = Address::generate(&env);
        let admin_addr = Address::generate(&env);

        // 21.x API: register_stellar_asset_contract_v2
        let token_admin = Address::generate(&env);
        let token_addr = env.register_stellar_asset_contract_v2(token_admin).address();

        StellarAssetClient::new(&env, &token_addr).mint(&client_addr, &10_000);
        TokenClient::new(&env, &token_addr).approve(
            &client_addr,
            &escrow_id,
            &10_000,
            &(env.ledger().sequence() + 1_000),
        );

        // Symbol max is 32 chars; this is well within that limit.
        // The backend uses contractIdToSymbol() to derive a ≤32-char key from
        // the full UUID — see escrow.service.ts.
        let contract_id = Symbol::new(&env, "contract_abc1");

        Fixture { env, escrow_id, contract_id, client: client_addr, freelancer: freelancer_addr, admin: admin_addr, token_addr }
    }

    fn escrow(&self) -> StellanceEscrowClient {
        StellanceEscrowClient::new(&self.env, &self.escrow_id)
    }

    fn token(&self) -> TokenClient {
        TokenClient::new(&self.env, &self.token_addr)
    }

    fn fund(&self, amount: i128) {
        self.escrow()
            .fund(&self.contract_id, &self.client, &self.freelancer, &self.admin, &amount, &self.token_addr);
    }
}

// ---------------------------------------------------------------------------
// fund()
// ---------------------------------------------------------------------------

#[test]
fn fund_creates_entry() {
    let f = Fixture::setup();
    f.fund(1_000);
    let entry = f.escrow().get_escrow(&f.contract_id).unwrap();
    assert_eq!(entry.total_amount, 1_000);
    assert_eq!(entry.released_amount, 0);
    assert_eq!(entry.status, EscrowStatus::Funded);
    assert_eq!(entry.client, f.client);
    assert_eq!(entry.freelancer, f.freelancer);
    assert_eq!(entry.admin, f.admin);
}

#[test]
fn fund_double_funding_returns_error() {
    let f = Fixture::setup();
    f.fund(500);
    let result = f.escrow().try_fund(
        &f.contract_id, &f.client, &f.freelancer, &f.admin, &500, &f.token_addr,
    );
    assert_eq!(result, Err(Ok(EscrowError::AlreadyFunded)));
}

#[test]
fn fund_zero_amount_is_rejected() {
    let f = Fixture::setup();
    let result = f.escrow().try_fund(
        &f.contract_id, &f.client, &f.freelancer, &f.admin, &0, &f.token_addr,
    );
    assert_eq!(result, Err(Ok(EscrowError::InvalidAmount)));
}

#[test]
fn fund_negative_amount_is_rejected() {
    let f = Fixture::setup();
    let result = f.escrow().try_fund(
        &f.contract_id, &f.client, &f.freelancer, &f.admin, &-1, &f.token_addr,
    );
    assert_eq!(result, Err(Ok(EscrowError::InvalidAmount)));
}

// ---------------------------------------------------------------------------
// release_milestone()
// ---------------------------------------------------------------------------

#[test]
fn release_milestone_partial_amount_reaches_freelancer() {
    let f = Fixture::setup();
    f.fund(1_000);
    let before = f.token().balance(&f.freelancer);
    f.escrow().release_milestone(&f.contract_id, &f.client, &400);
    assert_eq!(f.token().balance(&f.freelancer) - before, 400);
    let entry = f.escrow().get_escrow(&f.contract_id).unwrap();
    assert_eq!(entry.released_amount, 400);
    assert_eq!(entry.status, EscrowStatus::Funded);
}

#[test]
fn release_milestone_full_amount_transitions_to_released() {
    let f = Fixture::setup();
    f.fund(1_000);
    f.escrow().release_milestone(&f.contract_id, &f.client, &600);
    f.escrow().release_milestone(&f.contract_id, &f.client, &400);
    let entry = f.escrow().get_escrow(&f.contract_id).unwrap();
    assert_eq!(entry.status, EscrowStatus::Released);
    assert_eq!(entry.released_amount, 1_000);
}

#[test]
fn release_milestone_admin_can_release() {
    let f = Fixture::setup();
    f.fund(1_000);
    f.escrow().release_milestone(&f.contract_id, &f.admin, &300);
    assert_eq!(f.escrow().get_escrow(&f.contract_id).unwrap().released_amount, 300);
}

#[test]
fn release_milestone_freelancer_cannot_release() {
    let f = Fixture::setup();
    f.fund(1_000);
    let result = f.escrow().try_release_milestone(&f.contract_id, &f.freelancer, &300);
    assert_eq!(result, Err(Ok(EscrowError::Unauthorized)));
}

#[test]
fn release_milestone_over_remaining_fails() {
    let f = Fixture::setup();
    f.fund(1_000);
    let result = f.escrow().try_release_milestone(&f.contract_id, &f.client, &1_001);
    assert_eq!(result, Err(Ok(EscrowError::InvalidState)));
}

#[test]
fn release_milestone_zero_amount_fails() {
    let f = Fixture::setup();
    f.fund(1_000);
    let result = f.escrow().try_release_milestone(&f.contract_id, &f.client, &0);
    // Zero amount is an invalid *input*, not an invalid state — use InvalidAmount,
    // consistent with the same check in fund().
    assert_eq!(result, Err(Ok(EscrowError::InvalidAmount)));
}

// ---------------------------------------------------------------------------
// release()
// ---------------------------------------------------------------------------

#[test]
fn release_all_sends_remaining_to_freelancer() {
    let f = Fixture::setup();
    f.fund(1_000);
    f.escrow().release_milestone(&f.contract_id, &f.client, &200);
    let before = f.token().balance(&f.freelancer);
    f.escrow().release(&f.contract_id, &f.client);
    assert_eq!(f.token().balance(&f.freelancer) - before, 800);
    assert_eq!(f.escrow().get_escrow(&f.contract_id).unwrap().status, EscrowStatus::Released);
}

#[test]
fn release_non_client_cannot_release() {
    let f = Fixture::setup();
    f.fund(1_000);
    let result = f.escrow().try_release(&f.contract_id, &f.freelancer);
    assert_eq!(result, Err(Ok(EscrowError::Unauthorized)));
}

// ---------------------------------------------------------------------------
// refund()
// ---------------------------------------------------------------------------

#[test]
fn refund_returns_funds_to_client() {
    let f = Fixture::setup();
    f.fund(1_000);
    let before = f.token().balance(&f.client);
    f.escrow().refund(&f.contract_id, &f.freelancer);
    assert_eq!(f.token().balance(&f.client) - before, 1_000);
    assert_eq!(f.escrow().get_escrow(&f.contract_id).unwrap().status, EscrowStatus::Refunded);
}

#[test]
fn refund_client_cannot_self_refund() {
    let f = Fixture::setup();
    f.fund(1_000);
    let result = f.escrow().try_refund(&f.contract_id, &f.client);
    assert_eq!(result, Err(Ok(EscrowError::Unauthorized)));
}

#[test]
fn refund_after_partial_release_returns_remainder() {
    let f = Fixture::setup();
    f.fund(1_000);
    f.escrow().release_milestone(&f.contract_id, &f.client, &300);
    let before = f.token().balance(&f.client);
    f.escrow().refund(&f.contract_id, &f.freelancer);
    assert_eq!(f.token().balance(&f.client) - before, 700);
}

// ---------------------------------------------------------------------------
// dispute()
// ---------------------------------------------------------------------------

#[test]
fn dispute_freezes_escrow() {
    let f = Fixture::setup();
    f.fund(1_000);
    f.escrow().dispute(&f.contract_id, &f.client);
    assert_eq!(f.escrow().get_escrow(&f.contract_id).unwrap().status, EscrowStatus::Disputed);
}

#[test]
fn dispute_blocks_release_milestone() {
    let f = Fixture::setup();
    f.fund(1_000);
    f.escrow().dispute(&f.contract_id, &f.freelancer);
    let result = f.escrow().try_release_milestone(&f.contract_id, &f.client, &500);
    assert_eq!(result, Err(Ok(EscrowError::InvalidState)));
}

#[test]
fn dispute_blocks_full_release() {
    let f = Fixture::setup();
    f.fund(1_000);
    f.escrow().dispute(&f.contract_id, &f.client);
    let result = f.escrow().try_release(&f.contract_id, &f.client);
    assert_eq!(result, Err(Ok(EscrowError::InvalidState)));
}

#[test]
fn dispute_blocks_refund() {
    let f = Fixture::setup();
    f.fund(1_000);
    f.escrow().dispute(&f.contract_id, &f.client);
    let result = f.escrow().try_refund(&f.contract_id, &f.freelancer);
    assert_eq!(result, Err(Ok(EscrowError::InvalidState)));
}

#[test]
fn dispute_by_third_party_fails() {
    let f = Fixture::setup();
    f.fund(1_000);
    let stranger = Address::generate(&f.env);
    let result = f.escrow().try_dispute(&f.contract_id, &stranger);
    assert_eq!(result, Err(Ok(EscrowError::Unauthorized)));
}

// ---------------------------------------------------------------------------
// resolve_dispute()
// ---------------------------------------------------------------------------

#[test]
fn resolve_dispute_release_to_freelancer() {
    let f = Fixture::setup();
    f.fund(1_000);
    f.escrow().dispute(&f.contract_id, &f.client);
    let before = f.token().balance(&f.freelancer);
    f.escrow()
        .resolve_dispute(&f.contract_id, &f.admin, &DisputeDecision::ReleaseToFreelancer, &0);
    assert_eq!(f.token().balance(&f.freelancer) - before, 1_000);
    assert_eq!(f.escrow().get_escrow(&f.contract_id).unwrap().status, EscrowStatus::Released);
}

#[test]
fn resolve_dispute_refund_to_client() {
    let f = Fixture::setup();
    f.fund(1_000);
    f.escrow().dispute(&f.contract_id, &f.freelancer);
    let before = f.token().balance(&f.client);
    f.escrow()
        .resolve_dispute(&f.contract_id, &f.admin, &DisputeDecision::RefundToClient, &0);
    assert_eq!(f.token().balance(&f.client) - before, 1_000);
    assert_eq!(f.escrow().get_escrow(&f.contract_id).unwrap().status, EscrowStatus::Refunded);
}

#[test]
fn resolve_dispute_split_60_40_is_atomic() {
    let f = Fixture::setup();
    f.fund(1_000);
    f.escrow().dispute(&f.contract_id, &f.client);
    let fl_before = f.token().balance(&f.freelancer);
    let cl_before = f.token().balance(&f.client);
    f.escrow()
        .resolve_dispute(&f.contract_id, &f.admin, &DisputeDecision::Split, &6_000);
    assert_eq!(f.token().balance(&f.freelancer) - fl_before, 600);
    assert_eq!(f.token().balance(&f.client) - cl_before, 400);
    // A split must resolve to Resolved, not Released — the freelancer did not
    // receive 100% of the funds.
    assert_eq!(
        f.escrow().get_escrow(&f.contract_id).unwrap().status,
        EscrowStatus::Resolved,
    );
}

#[test]
fn resolve_dispute_split_100_0_sends_all_to_freelancer_and_resolves() {
    let f = Fixture::setup();
    f.fund(1_000);
    f.escrow().dispute(&f.contract_id, &f.client);
    let fl_before = f.token().balance(&f.freelancer);
    let cl_before = f.token().balance(&f.client);
    f.escrow()
        .resolve_dispute(&f.contract_id, &f.admin, &DisputeDecision::Split, &10_000);
    assert_eq!(f.token().balance(&f.freelancer) - fl_before, 1_000);
    assert_eq!(f.token().balance(&f.client) - cl_before, 0);
    assert_eq!(
        f.escrow().get_escrow(&f.contract_id).unwrap().status,
        EscrowStatus::Resolved,
    );
}

#[test]
fn resolve_dispute_split_0_100_sends_all_to_client_and_resolves() {
    let f = Fixture::setup();
    f.fund(1_000);
    f.escrow().dispute(&f.contract_id, &f.client);
    let fl_before = f.token().balance(&f.freelancer);
    let cl_before = f.token().balance(&f.client);
    f.escrow()
        .resolve_dispute(&f.contract_id, &f.admin, &DisputeDecision::Split, &0);
    assert_eq!(f.token().balance(&f.freelancer) - fl_before, 0);
    assert_eq!(f.token().balance(&f.client) - cl_before, 1_000);
    assert_eq!(
        f.escrow().get_escrow(&f.contract_id).unwrap().status,
        EscrowStatus::Resolved,
    );
}

#[test]
fn resolve_dispute_non_admin_fails() {
    let f = Fixture::setup();
    f.fund(1_000);
    f.escrow().dispute(&f.contract_id, &f.client);
    let result = f.escrow().try_resolve_dispute(
        &f.contract_id, &f.client, &DisputeDecision::ReleaseToFreelancer, &0,
    );
    assert_eq!(result, Err(Ok(EscrowError::Unauthorized)));
}

#[test]
fn resolve_dispute_invalid_bps_fails() {
    let f = Fixture::setup();
    f.fund(1_000);
    f.escrow().dispute(&f.contract_id, &f.client);
    let result = f.escrow().try_resolve_dispute(
        &f.contract_id, &f.admin, &DisputeDecision::Split, &10_001,
    );
    assert_eq!(result, Err(Ok(EscrowError::InvalidSplitBps)));
}

#[test]
fn resolve_dispute_on_non_disputed_fails() {
    let f = Fixture::setup();
    f.fund(1_000);
    let result = f.escrow().try_resolve_dispute(
        &f.contract_id, &f.admin, &DisputeDecision::ReleaseToFreelancer, &0,
    );
    assert_eq!(result, Err(Ok(EscrowError::InvalidState)));
}

// ---------------------------------------------------------------------------
// get_escrow()
// ---------------------------------------------------------------------------

#[test]
fn get_escrow_returns_none_for_unknown_contract() {
    let f = Fixture::setup();
    let unknown = Symbol::new(&f.env, "no_such_id");
    assert!(f.escrow().get_escrow(&unknown).is_none());
}

// ---------------------------------------------------------------------------
// ping()
// ---------------------------------------------------------------------------

#[test]
fn ping_emits_event() {
    let env = Env::default();
    let id = env.register_contract(None, StellanceEscrow);
    StellanceEscrowClient::new(&env, &id).ping();
}

// ---------------------------------------------------------------------------
// version()
// ---------------------------------------------------------------------------

#[test]
fn version_returns_semver_string() {
    let env = Env::default();
    let id = env.register_contract(None, StellanceEscrow);
    let client = StellanceEscrowClient::new(&env, &id);
    let v = client.version();
    // Verify it equals the expected semver string.
    let expected = soroban_sdk::String::from_str(&env, "1.1.0");
    assert_eq!(v, expected, "version() should return '1.1.0'");
}

// ---------------------------------------------------------------------------
// get_admin()
// ---------------------------------------------------------------------------

#[test]
fn get_admin_returns_none_before_fund() {
    let f = Fixture::setup();
    let unknown = Symbol::new(&f.env, "unfunded_abc12");
    assert!(
        f.escrow().get_admin(&unknown).is_none(),
        "get_admin() should return None when no escrow exists"
    );
}

#[test]
fn get_admin_returns_admin_after_fund() {
    let f = Fixture::setup();
    f.fund(500);
    let admin_returned = f
        .escrow()
        .get_admin(&f.contract_id)
        .expect("get_admin() should return Some after fund()");
    assert_eq!(
        admin_returned, f.admin,
        "get_admin() should return the admin address set at fund time"
    );
}

#[test]
fn get_admin_still_readable_after_release() {
    let f = Fixture::setup();
    f.fund(500);
    f.escrow().release(&f.contract_id, &f.client);
    // Admin should still be readable from the terminal record.
    let admin_returned = f
        .escrow()
        .get_admin(&f.contract_id)
        .expect("get_admin() should be readable on a Released escrow");
    assert_eq!(admin_returned, f.admin);
}
