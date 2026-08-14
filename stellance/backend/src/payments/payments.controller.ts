import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { PaymentsService } from './payments.service';
import { WithdrawDto } from './dto/withdraw.dto';
import { PrismaService } from '../prisma/prisma.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '../generated/prisma/client';

interface AuthRequest extends Request {
  user: { id: string; role: UserRole };
}

/**
 * PaymentsController
 *
 * Exposes the full payments surface the frontend consumes:
 *
 *   GET  /payments/balances              — Horizon XLM + USDC balances
 *   GET  /payments/transactions          — unified transaction history
 *   GET  /payments/earnings              — freelancer earnings aggregate
 *   POST /payments/withdraw              — XLM withdrawal via Stellar SDK
 *   GET  /payments/contracts/:contractId — per-contract payment records
 *   GET  /payments/tx/:txHash            — look up a payment by tx hash
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
   * GET /payments/balances
   *
   * Returns XLM and USDC balances for the authenticated user's Stellar account.
   * Queries Horizon directly using the stellarPublicKey stored on the user.
   *
   * Returns zero balances (not an error) when the user hasn't linked a wallet.
   */
  @ApiOperation({
    summary: 'Get wallet balances from Horizon (XLM + USDC)',
  })
  @Get('balances')
  async getBalances(@Req() req: AuthRequest) {
    return this.paymentsService.getBalances(req.user.id);
  }

  /**
   * GET /payments/transactions
   *
   * Returns a unified transaction history derived from Payment records,
   * enriched with job titles and counterparty addresses.
   *
   * The list is ordered newest-first and covers all contracts where the
   * authenticated user is either the client or the freelancer.
   */
  @ApiOperation({
    summary: 'Get full transaction history for the authenticated user',
  })
  @Get('transactions')
  async getTransactions(@Req() req: AuthRequest) {
    return this.paymentsService.getTransactions(req.user.id);
  }

  /**
   * GET /payments/earnings
   *
   * Freelancer earnings aggregate: total earned, payment count, and a
   * breakdown by contract.
   *
   * Admins see data for their own account. To view another user's earnings,
   * use GET /users/:id/earnings (not yet implemented).
   */
  @ApiOperation({
    summary: 'Freelancer earnings aggregate (total + per-contract breakdown)',
  })
  @Get('earnings')
  async getEarnings(@Req() req: AuthRequest) {
    return this.paymentsService.getEarnings(req.user.id);
  }

  /**
   * POST /payments/withdraw
   *
   * Initiates a withdrawal from the platform admin account to the caller's
   * specified destination Stellar address.
   *
   * Currently only XLM is supported. USDC support via SEP-24 anchor is
   * tracked as issue #89.
   */
  @ApiOperation({
    summary:
      'Withdraw XLM to a Stellar address (admin-assisted; SEP-24 off-ramp pending)',
  })
  @Post('withdraw')
  @HttpCode(HttpStatus.OK)
  async withdraw(@Req() req: AuthRequest, @Body() dto: WithdrawDto) {
    return this.paymentsService.withdraw({
      userId: req.user.id,
      asset: dto.asset,
      amount: dto.amount,
      destinationAddress: dto.destinationAddress,
    });
  }

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
    if (!contract)
      throw new NotFoundException(`Contract ${contractId} not found`);

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
    if (!payment)
      throw new NotFoundException(`No payment found for tx ${txHash}`);
    return payment;
  }
}
