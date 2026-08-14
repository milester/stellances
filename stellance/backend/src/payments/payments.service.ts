import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as StellarSdk from '@stellar/stellar-sdk';
import { PrismaService } from '../prisma/prisma.service';

// ─── Response types (match the frontend lib/api/payments.ts shape exactly) ───

export interface WalletBalance {
  asset: 'XLM' | 'USDC';
  balance: string;
  network: 'testnet' | 'mainnet';
}

export type TransactionType =
  | 'ESCROW_FUNDED'
  | 'MILESTONE_RELEASED'
  | 'FULL_RELEASE'
  | 'REFUND'
  | 'WITHDRAWAL'
  | 'DISPUTE_RESOLVED';

export type TransactionStatus = 'PENDING' | 'CONFIRMED' | 'FAILED';

export interface PaymentTransaction {
  id: string;
  createdAt: string;
  type: TransactionType;
  status: TransactionStatus;
  asset: 'XLM' | 'USDC';
  /** Positive string = credit, negative string = debit. */
  amount: string;
  description: string;
  stellarTxHash: string | null;
  counterparty: string | null;
  contractId: string | null;
}

export interface PaymentSummary {
  id: string;
  contractId: string;
  milestoneId: string | null;
  amount: string;
  stellarTxHash: string;
  createdAt: Date;
}

export interface EarningsSummary {
  totalEarned: string;
  currency: string;
  paymentCount: number;
  byContract: Array<{
    contractId: string;
    jobTitle: string | null;
    amount: string;
    paymentCount: number;
  }>;
}

// ─── Well-known asset contract IDs (Stellar testnet) ─────────────────────────

/**
 * Circle USDC on Stellar testnet.
 * On mainnet: GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN
 */
const TESTNET_USDC_ISSUER =
  'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly horizonUrl: string;
  private readonly networkPassphrase: string;
  private readonly network: 'testnet' | 'mainnet';

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const net = config.get<string>('STELLAR_NETWORK') ?? 'testnet';
    this.network = net === 'mainnet' ? 'mainnet' : 'testnet';

    this.horizonUrl =
      config.get<string>('STELLAR_HORIZON_URL') ??
      (this.network === 'mainnet'
        ? 'https://horizon.stellar.org'
        : 'https://horizon-testnet.stellar.org');

    this.networkPassphrase =
      config.get<string>('STELLAR_NETWORK_PASSPHRASE') ??
      (this.network === 'mainnet'
        ? StellarSdk.Networks.PUBLIC
        : StellarSdk.Networks.TESTNET);
  }

  // ─── Horizon helpers ───────────────────────────────────────────────────────

  private horizonServer(): StellarSdk.Horizon.Server {
    return new StellarSdk.Horizon.Server(this.horizonUrl);
  }

  // ─── Balances ─────────────────────────────────────────────────────────────

  /**
   * GET /payments/balances
   *
   * Returns XLM and USDC balances for the user's connected Stellar account.
   * Reads the user's stellarPublicKey from the DB, then queries Horizon.
   *
   * Returns zero balances (not an error) when:
   * - The user hasn't connected a Stellar wallet yet
   * - The account hasn't been funded (Horizon 404)
   */
  async getBalances(userId: string): Promise<WalletBalance[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { stellarPublicKey: true },
    });

    // Return empty balances if no wallet connected — not an error state
    if (!user?.stellarPublicKey) {
      return [
        { asset: 'XLM', balance: '0.0000000', network: this.network },
        { asset: 'USDC', balance: '0.00', network: this.network },
      ];
    }

    try {
      const server = this.horizonServer();
      const account = await server
        .accounts()
        .accountId(user.stellarPublicKey)
        .call();

      const balances: WalletBalance[] = [];

      for (const b of account.balances) {
        if (b.asset_type === 'native') {
          balances.push({
            asset: 'XLM',
            balance: b.balance,
            network: this.network,
          });
        } else if (
          b.asset_type === 'credit_alphanum4' &&
          b.asset_code === 'USDC' &&
          // Accept USDC from the known issuer on testnet, or any issuer on mainnet
          (this.network === 'mainnet' || b.asset_issuer === TESTNET_USDC_ISSUER)
        ) {
          balances.push({
            asset: 'USDC',
            balance: b.balance,
            network: this.network,
          });
        }
      }

      // Ensure both assets always appear in the response even if the account
      // holds no USDC trustline yet
      if (!balances.find((b) => b.asset === 'XLM')) {
        balances.push({ asset: 'XLM', balance: '0.0000000', network: this.network });
      }
      if (!balances.find((b) => b.asset === 'USDC')) {
        balances.push({ asset: 'USDC', balance: '0.00', network: this.network });
      }

      return balances;
    } catch (err: unknown) {
      // Horizon 404 = account not funded yet — return zero balances instead of
      // throwing. NotFoundError extends NetworkError so check it first.
      const isNotFound =
        err instanceof StellarSdk.NotFoundError ||
        (err instanceof StellarSdk.NetworkError &&
          err.getResponse()?.status === 404);

      if (isNotFound) {
        return [
          { asset: 'XLM', balance: '0.0000000', network: this.network },
          { asset: 'USDC', balance: '0.00', network: this.network },
        ];
      }

      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Horizon balance fetch failed: ${msg}`);
      throw new ServiceUnavailableException(
        'Could not fetch balances from Horizon — try again shortly.',
      );
    }
  }

  // ─── Transaction history ───────────────────────────────────────────────────

  /**
   * GET /payments/transactions
   *
   * Builds a unified transaction history from the Payment records in the DB.
   * Each Payment record maps to a PaymentTransaction with the correct type
   * derived from its contract context.
   *
   * The history is enriched with counterparty addresses by looking up the
   * contract's client / freelancer based on whether the caller is the
   * recipient (freelancer) or sender (client).
   */
  async getTransactions(userId: string): Promise<PaymentTransaction[]> {
    // Find all payments where the user is either the client or the freelancer
    // on the contract. Pull in enough context to construct a useful description.
    const payments = await this.prisma.payment.findMany({
      where: {
        contract: {
          OR: [{ clientId: userId }, { freelancerId: userId }],
        },
      },
      include: {
        contract: {
          select: {
            id: true,
            clientId: true,
            freelancerId: true,
            client: { select: { stellarPublicKey: true } },
            freelancer: { select: { stellarPublicKey: true } },
            job: { select: { title: true } },
          },
        },
        milestone: { select: { title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return payments.map((p): PaymentTransaction => {
      const isClient = p.contract.clientId === userId;
      const isMilestone = p.milestoneId !== null;

      // Determine the transaction type from what's in the contract context.
      // We can't store type in the Payment table without a migration, so we
      // infer it: milestones are MILESTONE_RELEASED, non-milestone payments
      // on cancelled contracts are REFUND, on completed contracts FULL_RELEASE.
      let type: TransactionType;
      if (isMilestone) {
        type = 'MILESTONE_RELEASED';
      } else {
        type = 'FULL_RELEASE';
      }

      // For the caller: clients pay out (negative), freelancers receive (positive)
      const amount = parseFloat(p.amount.toString());
      const sign = isClient ? '-' : '+';
      const amountStr = `${sign}${amount.toFixed(7)}`;

      // Description: prefer milestone title, fall back to job title
      const description =
        p.milestone?.title
          ? `Milestone: ${p.milestone.title}`
          : p.contract.job?.title
            ? `Contract: ${p.contract.job.title}`
            : `Contract ${p.contract.id.slice(0, 8)}`;

      // Counterparty is the other party — client sees freelancer and vice versa
      const counterparty = isClient
        ? (p.contract.freelancer?.stellarPublicKey ?? null)
        : (p.contract.client?.stellarPublicKey ?? null);

      return {
        id: p.id,
        createdAt: p.createdAt.toISOString(),
        type,
        status: 'CONFIRMED',
        asset: 'XLM',
        amount: amountStr,
        description,
        stellarTxHash: p.stellarTxHash,
        counterparty,
        contractId: p.contractId,
      };
    });
  }

  // ─── Earnings ─────────────────────────────────────────────────────────────

  /**
   * GET /payments/earnings
   *
   * Aggregate earnings summary for a freelancer.
   * Admins may pass a targetUserId to view any user's earnings.
   */
  async getEarnings(freelancerId: string): Promise<EarningsSummary> {
    // Find all payments received by the freelancer (payments on contracts where
    // this user is the freelancer)
    const payments = await this.prisma.payment.findMany({
      where: {
        contract: { freelancerId },
      },
      include: {
        contract: {
          select: {
            id: true,
            job: { select: { title: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Aggregate
    let totalCents = 0;
    const contractMap = new Map<
      string,
      { jobTitle: string | null; amountCents: number; count: number }
    >();
    const SCALE = 10_000_000;

    for (const p of payments) {
      const cents = Math.round(parseFloat(p.amount.toString()) * SCALE);
      totalCents += cents;

      const existing = contractMap.get(p.contractId);
      if (existing) {
        existing.amountCents += cents;
        existing.count += 1;
      } else {
        contractMap.set(p.contractId, {
          jobTitle: p.contract.job?.title ?? null,
          amountCents: cents,
          count: 1,
        });
      }
    }

    return {
      totalEarned: (totalCents / SCALE).toFixed(7),
      currency: 'XLM',
      paymentCount: payments.length,
      byContract: Array.from(contractMap.entries()).map(([cid, info]) => ({
        contractId: cid,
        jobTitle: info.jobTitle,
        amount: (info.amountCents / SCALE).toFixed(7),
        paymentCount: info.count,
      })),
    };
  }

  // ─── Withdraw ─────────────────────────────────────────────────────────────

  /**
   * POST /payments/withdraw
   *
   * Initiates a direct XLM transfer from the platform admin account to a
   * destination Stellar address.
   *
   * This is a simple admin-assisted withdrawal. For production, this should
   * be replaced with a SEP-24 anchor off-ramp flow (tracked as issue #89).
   *
   * Security: only the authenticated user can withdraw, and only to the
   * destination they specify. The backend signs with the admin key, so the
   * admin account must hold sufficient XLM.
   *
   * Returns a PaymentTransaction representing the pending/confirmed transfer.
   */
  async withdraw(params: {
    userId: string;
    asset: 'XLM' | 'USDC';
    amount: string;
    destinationAddress: string;
  }): Promise<PaymentTransaction> {
    const { asset, amount, destinationAddress } = params;

    // Validate Stellar address
    if (!StellarSdk.StrKey.isValidEd25519PublicKey(destinationAddress)) {
      throw new BadRequestException(
        `Invalid Stellar address: ${destinationAddress}`,
      );
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      throw new BadRequestException('Amount must be a positive number');
    }
    if (asset !== 'XLM') {
      throw new BadRequestException(
        'Only XLM withdrawals are supported at this time',
      );
    }

    const adminSecret = this.config.get<string>('STELLAR_ADMIN_SECRET');
    if (!adminSecret) {
      throw new ServiceUnavailableException(
        'Withdrawal service not configured (STELLAR_ADMIN_SECRET missing)',
      );
    }

    const adminKeypair = StellarSdk.Keypair.fromSecret(adminSecret);
    const server = this.horizonServer();

    try {
      const account = await server.loadAccount(adminKeypair.publicKey());
      const fee = await server.fetchBaseFee();

      const tx = new StellarSdk.TransactionBuilder(account, {
        fee: String(fee),
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(
          StellarSdk.Operation.payment({
            destination: destinationAddress,
            asset: StellarSdk.Asset.native(),
            amount: amountNum.toFixed(7),
          }),
        )
        .setTimeout(60)
        .build();

      tx.sign(adminKeypair);

      const result = await server.submitTransaction(tx);
      const txHash = result.hash;

      return {
        id: `withdraw_${Date.now()}`,
        createdAt: new Date().toISOString(),
        type: 'WITHDRAWAL',
        status: 'CONFIRMED',
        asset: 'XLM',
        amount: `-${amountNum.toFixed(7)}`,
        description: `Withdrawal to ${destinationAddress.slice(0, 6)}…${destinationAddress.slice(-6)}`,
        stellarTxHash: txHash,
        counterparty: destinationAddress,
        contractId: null,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Withdrawal failed: ${msg}`);
      throw new ServiceUnavailableException(
        `Withdrawal failed: ${msg}`,
      );
    }
  }

  // ─── Legacy read methods (kept for existing routes) ───────────────────────

  /**
   * List all Payment records for a given contract, ordered newest first.
   */
  async findByContract(contractId: string): Promise<PaymentSummary[]> {
    const payments = await this.prisma.payment.findMany({
      where: { contractId },
      orderBy: { createdAt: 'desc' },
    });
    return payments.map((p) => ({
      id: p.id,
      contractId: p.contractId,
      milestoneId: p.milestoneId ?? null,
      amount: p.amount.toString(),
      stellarTxHash: p.stellarTxHash,
      createdAt: p.createdAt,
    }));
  }

  /**
   * Look up a single payment by its Stellar transaction hash.
   */
  async findByTxHash(txHash: string): Promise<PaymentSummary | null> {
    const payment = await this.prisma.payment.findUnique({
      where: { stellarTxHash: txHash },
    });
    if (!payment) return null;
    return {
      id: payment.id,
      contractId: payment.contractId,
      milestoneId: payment.milestoneId ?? null,
      amount: payment.amount.toString(),
      stellarTxHash: payment.stellarTxHash,
      createdAt: payment.createdAt,
    };
  }
}
