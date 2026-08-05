import { Controller, Get, Param, Req } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '../generated/prisma/client';

interface AuthRequest extends Request {
  user: { id: string; role: UserRole };
}

/**
 * PaymentsController
 *
 * Exposes read-only endpoints over the Payment ledger. Writes happen via
 * ContractsService when milestones are approved on-chain.
 *
 * Endpoints in active development:
 *   GET /payments/earnings — freelancer aggregate earnings dashboard
 *   POST /payments/withdraw — trigger SEP-24 anchor off-ramp
 */
@ApiTags('payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * GET /payments/contracts/:contractId
   *
   * Returns all payment records for a contract. The caller must be the client
   * or freelancer on that contract, or an admin.
   */
  @ApiOperation({ summary: 'List payments for a contract' })
  @ApiParam({ name: 'contractId', description: 'Contract UUID' })
  @Get('contracts/:contractId')
  async findByContract(
    @Param('contractId') contractId: string,
    @Req() req: AuthRequest,
  ) {
    // Verify the caller is a party to the contract (or admin)
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      select: { clientId: true, freelancerId: true },
    });
    if (!contract) throw new NotFoundException(`Contract ${contractId} not found`);

    const { id: callerId, role } = req.user;
    if (
      role !== UserRole.ADMIN &&
      contract.clientId !== callerId &&
      contract.freelancerId !== callerId
    ) {
      throw new ForbiddenException('Access denied');
    }

    return this.paymentsService.findByContract(contractId);
  }

  /**
   * GET /payments/tx/:txHash
   *
   * Look up a payment by its Stellar transaction hash.
   * Any authenticated user may call this — the tx hash is public on-chain.
   */
  @ApiOperation({ summary: 'Look up a payment by Stellar tx hash' })
  @ApiParam({ name: 'txHash', description: 'Stellar transaction hash (hex)' })
  @Get('tx/:txHash')
  async findByTxHash(@Param('txHash') txHash: string) {
    const payment = await this.paymentsService.findByTxHash(txHash);
    if (!payment) throw new NotFoundException(`No payment found for tx ${txHash}`);
    return payment;
  }
}
