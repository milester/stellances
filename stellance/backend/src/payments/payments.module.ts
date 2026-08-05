import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

/**
 * PaymentsModule
 *
 * Exposes read-only access to the Payment ledger.
 * Payments are written by ContractsModule when milestones are released on-chain.
 *
 * Active development:
 * - Earnings aggregation for freelancer dashboard
 * - SEP-24 anchor withdrawal (fiat off-ramp)
 * - Horizon event streaming for real-time payment confirmations
 */
@Module({
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
