import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PrismaModule } from '../prisma/prisma.module';

/**
 * PaymentsModule
 *
 * Exposes the full payments surface:
 *   GET  /payments/balances              — Horizon XLM + USDC balances
 *   GET  /payments/transactions          — unified transaction history
 *   GET  /payments/earnings              — freelancer earnings aggregate
 *   POST /payments/withdraw              — XLM withdrawal via Stellar SDK
 *   GET  /payments/contracts/:contractId — per-contract payment records
 *   GET  /payments/tx/:txHash            — look up a payment by tx hash
 *
 * ConfigModule is global (registered in AppModule) so it does not need to
 * be re-imported here. PrismaModule provides the PrismaService dependency.
 */
@Module({
  imports: [PrismaModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
