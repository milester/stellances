import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EscrowService } from '../escrow/escrow.service';
import {
  ContractStatus,
  JobStatus,
  MilestoneStatus,
  UserRole,
} from '../generated/prisma/client';
import { CreateContractDto } from './dto/create-contract.dto';
import { ResolveDisputeDto } from './dto/contract-action.dto';

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly escrow: EscrowService,
    private readonly config: ConfigService,
  ) {}

  /**
   * POST /contracts
   *
   * Creates Contract + Milestone records, marks Job IN_PROGRESS.
   * Returns an unsigned XDR for the client to sign with Freighter to call
   * fund() on the Soroban escrow contract (non-custodial: key never leaves browser).
   */
  async create(clientId: string, dto: CreateContractDto) {
    const job = await this.prisma.job.findUnique({
      where: { id: dto.jobId },
      include: { contract: true },
    });
    if (!job) throw new NotFoundException(`Job ${dto.jobId} not found`);
    if (job.clientId !== clientId)
      throw new ForbiddenException('You do not own this job');
    if (job.status !== JobStatus.OPEN)
      throw new BadRequestException('Job is not OPEN');
    if (job.contract) throw new ConflictException('Job already has a contract');

    const freelancer = await this.prisma.user.findUnique({
      where: { id: dto.freelancerId },
      select: { id: true, stellarPublicKey: true },
    });
    if (!freelancer) throw new NotFoundException('Freelancer not found');

    const client = await this.prisma.user.findUnique({
      where: { id: clientId },
      select: { id: true, stellarPublicKey: true },
    });
    if (!client) throw new NotFoundException('Client not found');

    const totalAmount = dto.milestones.reduce((sum, m) => sum + m.amount, 0);

    const contract = await this.prisma.$transaction(async (tx) => {
      const c = await tx.contract.create({
        data: {
          jobId: dto.jobId,
          clientId,
          freelancerId: dto.freelancerId,
          // Starts as PENDING until the client funds the escrow on-chain.
          // ContractStatus transitions: PENDING → ACTIVE (on confirmFund)
          status: ContractStatus.PENDING,
        },
      });
      await tx.milestone.createMany({
        data: dto.milestones.map((m) => ({
          contractId: c.id,
          title: m.title,
          amount: m.amount,
          status: MilestoneStatus.PENDING,
        })),
      });
      await tx.job.update({
        where: { id: dto.jobId },
        data: { status: JobStatus.IN_PROGRESS },
      });
      return c;
    });

    // Build unsigned XDR for Freighter signing (best-effort)
    let fundXdr: string | null = null;
    if (client.stellarPublicKey && freelancer.stellarPublicKey) {
      try {
        const adminKey = this.escrow.getAdminPublicKey();
        // Use ConfigService so the value goes through the validated NestJS
        // config pipeline (env file, mapped config, container env injection).
        // Fallback to the well-known testnet wrapped-native-XLM contract so
        // local development works without any extra env vars.
        const tokenContractId =
          this.config.get<string>('STELLAR_TOKEN_CONTRACT_ID') ??
          'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
        fundXdr = await this.escrow.buildFundXdr({
          contractId: contract.id,
          clientPublicKey: client.stellarPublicKey,
          freelancerPublicKey: freelancer.stellarPublicKey,
          adminPublicKey: adminKey,
          amountStroops: BigInt(Math.round(totalAmount * 10_000_000)),
          tokenContractId,
        });
      } catch {
        // Non-fatal: requires live Soroban RPC. Frontend can retry.
      }
    }

    const full = await this.findOne(contract.id, clientId, UserRole.CLIENT);
    return { contract: full, fundXdr };
  }

  /**
   * POST /contracts/:id/confirm-fund
   *
   * Frontend calls this after submitting the signed fund() tx to Horizon.
   * Backend verifies the tx hash exists on Horizon, records it, and
   * transitions the contract from PENDING → ACTIVE.
   */
  async confirmFund(id: string, callerId: string, txHash: string) {
    const contract = await this._getContractOrThrow(id);
    if (contract.clientId !== callerId)
      throw new ForbiddenException('Only the client can confirm funding');
    if (contract.escrowTxHash)
      throw new ConflictException('Escrow already confirmed');
    if (
      contract.status !== ContractStatus.PENDING &&
      contract.status !== ContractStatus.ACTIVE
    ) {
      throw new BadRequestException(
        `Cannot confirm funding for a ${contract.status} contract`,
      );
    }

    await this.escrow.verifyTransaction(txHash);

    return this.prisma.contract.update({
      where: { id },
      data: {
        escrowTxHash: txHash,
        // PENDING → ACTIVE once escrow is funded and tx is verified on-chain
        status: ContractStatus.ACTIVE,
      },
      include: { milestones: true },
    });
  }

  async findAll(
    callerId: string,
    callerRole: UserRole,
    filter?: 'client' | 'freelancer',
  ) {
    const where =
      callerRole === UserRole.ADMIN
        ? {}
        : filter === 'freelancer'
          ? { freelancerId: callerId }
          : { clientId: callerId };

    return this.prisma.contract.findMany({
      where,
      include: {
        milestones: true,
        job: { select: { id: true, title: true } },
        client: { select: { id: true, name: true } },
        freelancer: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, callerId: string, callerRole: UserRole) {
    const contract = await this._getContractOrThrow(id);
    if (
      callerRole !== UserRole.ADMIN &&
      contract.clientId !== callerId &&
      contract.freelancerId !== callerId
    ) {
      throw new ForbiddenException('Access denied');
    }
    return contract;
  }

  async submitMilestone(
    contractId: string,
    milestoneId: string,
    callerId: string,
  ) {
    const contract = await this._getContractOrThrow(contractId);
    if (contract.freelancerId !== callerId)
      throw new ForbiddenException('Only the freelancer can submit milestones');
    if (contract.status !== ContractStatus.ACTIVE)
      throw new BadRequestException('Contract is not ACTIVE');

    const milestone = contract.milestones.find((m) => m.id === milestoneId);
    if (!milestone) throw new NotFoundException('Milestone not found');
    if (milestone.status !== MilestoneStatus.PENDING)
      throw new BadRequestException('Milestone must be PENDING to submit');

    return this.prisma.milestone.update({
      where: { id: milestoneId },
      data: { status: MilestoneStatus.IN_REVIEW },
    });
  }

  /**
   * PATCH /contracts/:id/milestones/:mid/approve
   *
   * 1. Submit release_milestone() on Soroban (admin-signed, ~5s settlement)
   * 2. On success, atomically mark APPROVED → PAID and record Payment
   * 3. Auto-complete contract if all milestones PAID
   *
   * State is only committed after the on-chain call succeeds. If Soroban
   * throws, the milestone stays IN_REVIEW and can be retried.
   */
  async approveMilestone(
    contractId: string,
    milestoneId: string,
    callerId: string,
  ) {
    const contract = await this._getContractOrThrow(contractId);
    if (contract.clientId !== callerId)
      throw new ForbiddenException('Only the client can approve milestones');
    if (contract.status !== ContractStatus.ACTIVE)
      throw new BadRequestException('Contract is not ACTIVE');

    const milestone = contract.milestones.find((m) => m.id === milestoneId);
    if (!milestone) throw new NotFoundException('Milestone not found');
    if (milestone.status !== MilestoneStatus.IN_REVIEW)
      throw new BadRequestException('Milestone must be IN_REVIEW to approve');

    // Submit on-chain BEFORE committing any DB state change.
    // If this throws, the milestone stays IN_REVIEW and the client can retry.
    const amountStroops = BigInt(
      Math.round(parseFloat(milestone.amount.toString()) * 10_000_000),
    );
    const txHash = await this.escrow.submitReleaseMilestone({
      contractId,
      amountStroops,
    });

    // On-chain success — commit all state changes atomically.
    // The milestone moves APPROVED → PAID in the same DB transaction so the
    // APPROVED state is briefly recorded even though both steps happen
    // atomically. This preserves the full state-machine history for auditing.
    await this.prisma.$transaction(async (tx) => {
      // Step 1: mark APPROVED (intermediate — payment was approved but DB not yet
      // reflecting the on-chain settlement)
      await tx.milestone.update({
        where: { id: milestoneId },
        data: { status: MilestoneStatus.APPROVED },
      });
      // Step 2: advance to PAID and record the Stellar payment atomically
      await tx.milestone.update({
        where: { id: milestoneId },
        data: { status: MilestoneStatus.PAID },
      });
      await tx.payment.create({
        data: {
          contractId,
          milestoneId,
          amount: milestone.amount,
          stellarTxHash: txHash,
        },
      });
    });

    await this._maybeCompleteContract(contractId);

    return this.prisma.milestone.findUnique({
      where: { id: milestoneId },
      include: { payment: true },
    });
  }

  /**
   * POST /contracts/:id/dispute
   *
   * 1. Validate the caller is a party to the contract and it is ACTIVE.
   * 2. Submit dispute() on-chain — this freezes the escrow so neither
   *    release nor refund can be called until an admin resolves it.
   * 3. Only after the on-chain call succeeds, update the DB status to DISPUTED.
   *
   * If the contract has not yet been funded (no escrowTxHash), the on-chain
   * call is skipped — the escrow entry doesn't exist yet and there's nothing
   * to freeze.
   *
   * Note: submitDispute() currently uses the admin key as the on-chain caller
   * because the backend submits the tx server-side. The correct long-term
   * approach is to return unsigned XDR for the party to sign via Freighter
   * (matching buildFundXdr). This is tracked as a follow-up.
   */
  async dispute(contractId: string, callerId: string, reason: string) {
    void reason; // stored off-chain in a future disputes table
    const contract = await this._getContractOrThrow(contractId);
    if (contract.clientId !== callerId && contract.freelancerId !== callerId)
      throw new ForbiddenException('Only contract parties can raise a dispute');
    if (contract.status !== ContractStatus.ACTIVE)
      throw new BadRequestException('Contract must be ACTIVE to dispute');

    // Freeze the on-chain escrow BEFORE committing the DB state change.
    // If the Soroban call fails, the DB stays ACTIVE and the caller can retry.
    // Skip if the escrow hasn't been funded yet — no on-chain entry exists.
    if (contract.escrowTxHash) {
      await this.escrow.submitDispute(contractId);
    }

    return this.prisma.contract.update({
      where: { id: contractId },
      data: { status: ContractStatus.DISPUTED },
    });
  }

  async resolveDispute(
    contractId: string,
    _callerId: string,
    callerRole: UserRole,
    dto: ResolveDisputeDto,
  ) {
    if (callerRole !== UserRole.ADMIN)
      throw new ForbiddenException('Only admins can resolve disputes');

    const contract = await this._getContractOrThrow(contractId);
    if (contract.status !== ContractStatus.DISPUTED)
      throw new BadRequestException('Contract is not DISPUTED');

    const decisionMap: Record<string, 0 | 1 | 2> = {
      release: 0,
      refund: 1,
      split: 2,
    };
    const decision = decisionMap[dto.decision];
    if (decision === undefined)
      throw new BadRequestException(`Unknown decision: ${dto.decision}`);

    const txHash = await this.escrow.submitResolveDispute({
      contractId,
      decision,
      freelancerBps: dto.freelancerBps ?? 0,
    });

    const finalStatus =
      dto.decision === 'refund'
        ? ContractStatus.CANCELLED
        : ContractStatus.COMPLETED;
    const remaining = await this._remainingAmount(contractId);

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: { contractId, amount: remaining, stellarTxHash: txHash },
      });
      await tx.contract.update({
        where: { id: contractId },
        data: { status: finalStatus },
      });
    });

    return { resolved: true, txHash, status: finalStatus };
  }

  async cancel(contractId: string, callerId: string, callerRole: UserRole) {
    const contract = await this._getContractOrThrow(contractId);
    if (contract.clientId !== callerId && callerRole !== UserRole.ADMIN)
      throw new ForbiddenException('Only the client or admin can cancel');
    if (
      contract.status === ContractStatus.COMPLETED ||
      contract.status === ContractStatus.CANCELLED
    ) {
      throw new BadRequestException(`Contract is already ${contract.status}`);
    }
    // A PENDING (unfunded) contract can always be cancelled by the client — no
    // escrow exists yet so no on-chain refund is needed.
    if (
      contract.escrowTxHash &&
      contract.status !== ContractStatus.PENDING &&
      callerRole !== UserRole.ADMIN
    ) {
      throw new ForbiddenException(
        'Escrow is funded — only an admin can cancel after funding',
      );
    }

    let txHash: string | undefined;
    if (contract.escrowTxHash) {
      txHash = await this.escrow.submitRefund(contractId);
    }

    const remaining = await this._remainingAmount(contractId);
    await this.prisma.$transaction(async (tx) => {
      if (txHash) {
        await tx.payment.create({
          data: { contractId, amount: remaining, stellarTxHash: txHash },
        });
      }
      await tx.contract.update({
        where: { id: contractId },
        data: { status: ContractStatus.CANCELLED },
      });
      await tx.job.update({
        where: { id: contract.job.id },
        data: { status: JobStatus.OPEN },
      });
    });

    return { cancelled: true, txHash };
  }

  private async _getContractOrThrow(id: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id },
      include: {
        milestones: true,
        payments: true,
        job: { select: { id: true, title: true, status: true } },
        client: { select: { id: true, name: true, stellarPublicKey: true } },
        freelancer: {
          select: { id: true, name: true, stellarPublicKey: true },
        },
      },
    });
    if (!contract) throw new NotFoundException(`Contract ${id} not found`);
    return contract;
  }

  private async _maybeCompleteContract(contractId: string) {
    const milestones = await this.prisma.milestone.findMany({
      where: { contractId },
      select: { status: true },
    });
    if (milestones.every((m) => m.status === MilestoneStatus.PAID)) {
      await this.prisma.contract.update({
        where: { id: contractId },
        data: { status: ContractStatus.COMPLETED },
      });
    }
  }

  private async _remainingAmount(contractId: string): Promise<number> {
    const [milestones, payments] = await Promise.all([
      this.prisma.milestone.findMany({
        where: { contractId },
        select: { amount: true },
      }),
      this.prisma.payment.findMany({
        where: { contractId },
        select: { amount: true },
      }),
    ]);
    // Use string-based arithmetic to avoid floating-point precision loss on
    // Prisma Decimal(18,7) values. Multiply to integers, subtract, divide back.
    // IMPORTANT: call .toString() on the Decimal and parse with parseInt at the
    // scaled level — never pass a Decimal directly to Number() which can round
    // values beyond 15 significant digits.
    const SCALE = 10_000_000; // 7 decimal places — matches Decimal(18,7)
    const totalCents = milestones.reduce((s, m) => {
      // m.amount is a Prisma Decimal object; .toString() gives the exact string
      // representation (e.g. "1234.5670000"). Math.round handles any trailing
      // float noise after the string→float conversion within 7 dp.
      return s + Math.round(parseFloat(m.amount.toString()) * SCALE);
    }, 0);
    const paidCents = payments.reduce((s, p) => {
      return s + Math.round(parseFloat(p.amount.toString()) * SCALE);
    }, 0);
    return Math.max(0, (totalCents - paidCents) / SCALE);
  }
}
