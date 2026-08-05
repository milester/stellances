import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as StellarSdk from '@stellar/stellar-sdk';

/**
 * EscrowService
 *
 * Wraps @stellar/stellar-sdk to build and submit Soroban invocation
 * transactions for the Stellance escrow contract on Stellar.
 *
 * Why Stellar-specific:
 * - buildFundXdr returns unsigned XDR for Freighter signing (non-custodial)
 * - release_milestone / refund / dispute / resolve_dispute are admin-signed server-side
 * - verifyTransaction checks Horizon for immutable on-chain proof
 * - All fees are ~$0.00001 XLM — makes per-milestone payments viable
 *
 * ## contract_id encoding (contractIdToSymbol)
 *
 * Soroban Symbol is limited to 32 characters. PostgreSQL UUIDs are 36 chars
 * (with hyphens). Every method that passes a contract ID to the chain calls
 * contractIdToSymbol() to strip hyphens, yielding a 32-char hex string that
 * fits within the Symbol limit. The Soroban contract stores and looks up
 * entries using this same 32-char key.
 */
@Injectable()
export class EscrowService {
  private readonly logger = new Logger(EscrowService.name);
  private readonly horizonUrl: string;
  private readonly sorobanRpcUrl: string;
  private readonly networkPassphrase: string;
  private readonly escrowContractId: string;
  private readonly adminKeypair: StellarSdk.Keypair | null;

  constructor(private readonly config: ConfigService) {
    const network = config.get<string>('STELLAR_NETWORK') ?? 'testnet';

    this.horizonUrl =
      config.get<string>('STELLAR_HORIZON_URL') ??
      (network === 'mainnet'
        ? 'https://horizon.stellar.org'
        : 'https://horizon-testnet.stellar.org');

    this.sorobanRpcUrl =
      config.get<string>('STELLAR_RPC_URL') ??
      (network === 'mainnet'
        ? 'https://mainnet.sorobanrpc.com'
        : 'https://soroban-testnet.stellar.org');

    this.networkPassphrase =
      config.get<string>('STELLAR_NETWORK_PASSPHRASE') ??
      (network === 'mainnet'
        ? StellarSdk.Networks.PUBLIC
        : StellarSdk.Networks.TESTNET);

    this.escrowContractId = config.get<string>('ESCROW_CONTRACT_ID') ?? '';

    const adminSecret = config.get<string>('STELLAR_ADMIN_SECRET');
    this.adminKeypair = adminSecret
      ? StellarSdk.Keypair.fromSecret(adminSecret)
      : null;

    if (!this.escrowContractId) {
      this.logger.warn('ESCROW_CONTRACT_ID not set — Soroban calls will fail');
    }
    if (!this.adminKeypair) {
      this.logger.warn(
        'STELLAR_ADMIN_SECRET not set — admin operations will fail',
      );
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /**
   * Convert a PostgreSQL UUID to a valid Soroban Symbol key.
   *
   * Soroban Symbol is limited to 32 characters ([a-zA-Z0-9_]).
   * A raw UUID is 36 characters (with hyphens) so it exceeds the limit.
   * Stripping hyphens yields exactly 32 hex characters.
   *
   * Both the backend and the Soroban contract must use the same encoding —
   * the contract stores entries under this 32-char key in persistent storage.
   */
  contractIdToSymbol(uuid: string): string {
    return uuid.replace(/-/g, '');
  }

  /** Public key of the platform admin account (used as escrow admin). */
  getAdminPublicKey(): string {
    if (!this.adminKeypair) {
      throw new ServiceUnavailableException(
        'Admin keypair not configured (STELLAR_ADMIN_SECRET)',
      );
    }
    return this.adminKeypair.publicKey();
  }

  // -------------------------------------------------------------------------
  // Horizon
  // -------------------------------------------------------------------------

  /**
   * Verify a Stellar transaction hash exists on Horizon.
   * Throws ServiceUnavailableException on network error or not found.
   */
  async verifyTransaction(txHash: string): Promise<{ ledger: number }> {
    try {
      const server = new StellarSdk.Horizon.Server(this.horizonUrl);
      const tx = await server.transactions().transaction(txHash).call();
      return { ledger: tx.ledger_attr };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new ServiceUnavailableException(
        `Cannot verify tx ${txHash} on Horizon: ${msg}`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Soroban — client-signed (XDR returned for Freighter)
  // -------------------------------------------------------------------------

  /**
   * Build an unsigned XDR envelope for the escrow fund() Soroban invocation.
   * Client signs this with Freighter — the platform never touches the client key.
   *
   * The contractId is converted to a Symbol-safe key via contractIdToSymbol().
   */
  async buildFundXdr(params: {
    contractId: string;
    clientPublicKey: string;
    freelancerPublicKey: string;
    adminPublicKey: string;
    amountStroops: bigint;
    tokenContractId: string;
  }): Promise<string> {
    const rpcServer = new StellarSdk.rpc.Server(this.sorobanRpcUrl);
    const account = await rpcServer.getAccount(params.clientPublicKey);
    const contract = new StellarSdk.Contract(this.escrowContractId);

    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        contract.call(
          'fund',
          // contractIdToSymbol strips hyphens so the UUID fits in 32 chars
          StellarSdk.nativeToScVal(this.contractIdToSymbol(params.contractId), {
            type: 'symbol',
          }),
          StellarSdk.nativeToScVal(params.clientPublicKey, { type: 'address' }),
          StellarSdk.nativeToScVal(params.freelancerPublicKey, {
            type: 'address',
          }),
          StellarSdk.nativeToScVal(params.adminPublicKey, { type: 'address' }),
          StellarSdk.nativeToScVal(params.amountStroops, { type: 'i128' }),
          StellarSdk.nativeToScVal(params.tokenContractId, { type: 'address' }),
        ),
      )
      .setTimeout(60)
      .build();

    const simResult = await rpcServer.simulateTransaction(tx);
    if (StellarSdk.rpc.Api.isSimulationError(simResult)) {
      throw new ServiceUnavailableException(
        `Soroban simulation failed: ${simResult.error}`,
      );
    }

    const prepared = StellarSdk.rpc.assembleTransaction(tx, simResult).build();
    return prepared.toEnvelope().toXDR('base64');
  }

  // -------------------------------------------------------------------------
  // Soroban — admin-signed (submitted directly by the backend)
  // -------------------------------------------------------------------------

  /** Submit release_milestone() for one approved milestone. Returns tx hash. */
  async submitReleaseMilestone(params: {
    contractId: string;
    amountStroops: bigint;
  }): Promise<string> {
    return this._submitAdminInvocation('release_milestone', [
      StellarSdk.nativeToScVal(this.contractIdToSymbol(params.contractId), {
        type: 'symbol',
      }),
      StellarSdk.nativeToScVal(this.getAdminPublicKey(), { type: 'address' }),
      StellarSdk.nativeToScVal(params.amountStroops, { type: 'i128' }),
    ]);
  }

  /** Submit release() — releases all remaining escrowed funds. */
  async submitRelease(contractId: string): Promise<string> {
    return this._submitAdminInvocation('release', [
      StellarSdk.nativeToScVal(this.contractIdToSymbol(contractId), {
        type: 'symbol',
      }),
      StellarSdk.nativeToScVal(this.getAdminPublicKey(), { type: 'address' }),
    ]);
  }

  /** Submit refund() — returns all funds to the client. */
  async submitRefund(contractId: string): Promise<string> {
    return this._submitAdminInvocation('refund', [
      StellarSdk.nativeToScVal(this.contractIdToSymbol(contractId), {
        type: 'symbol',
      }),
      StellarSdk.nativeToScVal(this.getAdminPublicKey(), { type: 'address' }),
    ]);
  }

  /**
   * Build an unsigned XDR envelope for the escrow dispute() Soroban invocation.
   *
   * The Soroban contract requires the caller to be the client OR the freelancer —
   * neither the admin nor the backend can satisfy that auth check on behalf of a
   * party. This method returns unsigned XDR so the disputing party can sign it
   * via Freighter, matching the same non-custodial pattern as buildFundXdr().
   *
   * Flow:
   *   1. Backend calls buildDisputeXdr({ contractId, callerPublicKey }).
   *   2. Frontend passes the XDR to Freighter for signing.
   *   3. Frontend submits the signed tx to Soroban RPC.
   *   4. Frontend calls POST /contracts/:id/dispute with the tx hash so the
   *      backend can verify and update the DB status.
   *
   * @param params.contractId      - PostgreSQL UUID of the contract.
   * @param params.callerPublicKey - Stellar G-address of the disputing party
   *                                 (must be client or freelancer in the escrow).
   */
  async buildDisputeXdr(params: {
    contractId: string;
    callerPublicKey: string;
  }): Promise<string> {
    const rpcServer = new StellarSdk.rpc.Server(this.sorobanRpcUrl);
    const account = await rpcServer.getAccount(params.callerPublicKey);
    const contract = new StellarSdk.Contract(this.escrowContractId);

    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        contract.call(
          'dispute',
          StellarSdk.nativeToScVal(
            this.contractIdToSymbol(params.contractId),
            { type: 'symbol' },
          ),
          StellarSdk.nativeToScVal(params.callerPublicKey, {
            type: 'address',
          }),
        ),
      )
      .setTimeout(60)
      .build();

    const simResult = await rpcServer.simulateTransaction(tx);
    if (StellarSdk.rpc.Api.isSimulationError(simResult)) {
      throw new ServiceUnavailableException(
        `Soroban simulation failed for dispute: ${simResult.error}`,
      );
    }

    const prepared = StellarSdk.rpc.assembleTransaction(tx, simResult).build();
    return prepared.toEnvelope().toXDR('base64');
  }

  /**
   * Submit dispute() — freeze the escrow on-chain using the admin keypair.
   *
   * This is an admin-signed fallback for cases where the disputing party
   * cannot sign with Freighter (e.g. dispute raised via a server-side
   * admin action or during testing). In production, prefer buildDisputeXdr()
   * so the disputing party signs themselves and the platform remains
   * non-custodial.
   *
   * The Soroban contract's dispute() function requires the caller to be the
   * client or freelancer; calling with the admin key will be rejected by the
   * contract unless the contract is amended to allow admin-initiated disputes.
   * Use this only in admin flows where on-chain authorisation is not required.
   */
  async submitDispute(contractId: string): Promise<string> {
    return this._submitAdminInvocation('dispute', [
      StellarSdk.nativeToScVal(this.contractIdToSymbol(contractId), {
        type: 'symbol',
      }),
      StellarSdk.nativeToScVal(this.getAdminPublicKey(), { type: 'address' }),
    ]);
  }

  /**
   * Submit resolve_dispute() — admin arbitration with optional split.
   * decision: 0 = ReleaseToFreelancer, 1 = RefundToClient, 2 = Split
   */
  async submitResolveDispute(params: {
    contractId: string;
    decision: 0 | 1 | 2;
    freelancerBps: number;
  }): Promise<string> {
    const variants = [
      'ReleaseToFreelancer',
      'RefundToClient',
      'Split',
    ] as const;
    return this._submitAdminInvocation('resolve_dispute', [
      StellarSdk.nativeToScVal(this.contractIdToSymbol(params.contractId), {
        type: 'symbol',
      }),
      StellarSdk.nativeToScVal(this.getAdminPublicKey(), { type: 'address' }),
      StellarSdk.xdr.ScVal.scvVec([
        StellarSdk.xdr.ScVal.scvSymbol(variants[params.decision]),
      ]),
      StellarSdk.nativeToScVal(params.freelancerBps, { type: 'u32' }),
    ]);
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private async _submitAdminInvocation(
    fnName: string,
    args: StellarSdk.xdr.ScVal[],
  ): Promise<string> {
    if (!this.adminKeypair) {
      throw new ServiceUnavailableException(
        'Admin keypair not configured (STELLAR_ADMIN_SECRET)',
      );
    }

    const rpcServer = new StellarSdk.rpc.Server(this.sorobanRpcUrl);
    const account = await rpcServer.getAccount(this.adminKeypair.publicKey());
    const contract = new StellarSdk.Contract(this.escrowContractId);

    const tx = new StellarSdk.TransactionBuilder(account, {
      fee: StellarSdk.BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(contract.call(fnName, ...args))
      .setTimeout(60)
      .build();

    const simResult = await rpcServer.simulateTransaction(tx);
    if (StellarSdk.rpc.Api.isSimulationError(simResult)) {
      throw new ServiceUnavailableException(
        `Soroban simulation failed for ${fnName}: ${simResult.error}`,
      );
    }

    const prepared = StellarSdk.rpc.assembleTransaction(tx, simResult).build();
    prepared.sign(this.adminKeypair);

    const sendResult = await rpcServer.sendTransaction(prepared);
    if (sendResult.status === 'ERROR') {
      throw new ServiceUnavailableException(
        `Transaction send failed for ${fnName}: ${JSON.stringify(sendResult.errorResult)}`,
      );
    }

    const hash = sendResult.hash;
    let getResult = await rpcServer.getTransaction(hash);
    let attempts = 0;
    while (
      getResult.status === StellarSdk.rpc.Api.GetTransactionStatus.NOT_FOUND &&
      attempts < 20
    ) {
      await new Promise((r) => setTimeout(r, 1500));
      getResult = await rpcServer.getTransaction(hash);
      attempts++;
    }

    if (getResult.status !== StellarSdk.rpc.Api.GetTransactionStatus.SUCCESS) {
      throw new ServiceUnavailableException(
        `Transaction ${hash} did not confirm (status: ${getResult.status})`,
      );
    }

    return hash;
  }
}
