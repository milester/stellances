import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface PaymentSummary {
  id: string;
  contractId: string;
  milestoneId: string | null;
  /** Amount in XLM (string to preserve Decimal precision over JSON) */
  amount: string;
  stellarTxHash: string;
  createdAt: Date;
}

/**
 * PaymentsService
 *
 * Provides read access to the Payment ledger recorded by ContractsService
 * whenever a milestone is released on-chain. Payments are written by
 * ContractsService; this service only exposes query methods so there is no
 * risk of accidental double-writes.
 *
 * Active development items:
 * - Aggregate payment totals per freelancer (earnings dashboard)
 * - Horizon event streaming to reconcile on-chain tx confirmations
 * - SEP-24 anchor withdrawal flow integration (fiat off-ramp)
 */
@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List all Payment records for a given contract, ordered newest first.
   * Both the client and the freelancer on the contract may call this.
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
   * Returns null if no matching record exists.
   * Useful for the frontend to show on-chain confirmation details.
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
