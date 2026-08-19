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
import { NotificationsService } from '../notifications/notifications.service';
import {
  ContractStatus,
  JobStatus,
  MilestoneStatus,
  NotificationType,
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
    private readonly notifications: NotificationsService,
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

    // Notify the freelancer that a contract has been created with them
    await this.notifications.create({
      userId: dto.freelancerId,
      type: NotificationType.CONTRACT_CREATED,
      title: 'New contract offer',
      body: `A contract has been created for "${job.title}". Waiting for escrow funding.`,
      contractId: contract.id,
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

    const updated = await this.prisma.contract.update({
      where: { id },
      data: {
        escrowTxHash: txHash,
        // PENDING → ACTIVE once escrow is funded and tx is verified on-chain
        status: ContractStatus.ACTIVE,
      },
      include: { milestones: true },
    });

    const jobTitle = contract.job.title;

    // Notify both parties that escrow is funded and work can begin
    await Promise.all([
      this.notifications.create({
        userId: contract.freelancerId,
        type: NotificationType.CONTRACT_FUNDED,
        title: 'Escrow funded — work can begin',
        body: `The client has funded the escrow for "${jobTitle}". You can now start work.`,
        contractId: id,
      }),
      this.notifications.create({
        userId: contract.clientId,
        type: NotificationType.CONTRACT_FUNDED,
        title: 'Escrow confirmed',
        body: `Your escrow for "${jobTitle}" is confirmed on Stellar (tx: ${txHash.slice(0, 10)}…).`,
        contractId: id,
      }),
    ]);

    return updated;
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

    const updated = await this.prisma.milestone.update({
      where: { id: milestoneId },
      data: { status: MilestoneStatus.IN_REVIEW },
    });

    // Notify the client that the freelancer has submitted a milestone for review
    await this.notifications.create({
      userId: contract.clientId,
      type: NotificationType.MILESTONE_SUBMITTED,
      title: 'Milestone ready for review',
      body: `"${milestone.title}" has been submitted for your review on contract "${contract.job.title}".`,
      contractId,
      milestoneId,
    });

    return updated;
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
    await this.prisma.$transaction(async (tx) => {
      await tx.milestone.update({
        where: { id: milestoneId },
        data: { status: MilestoneStatus.APPROVED },
      });
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

    // Notify the freelancer their milestone was approved and payment released
    const amountXlm = parseFloat(milestone.amount.toString()).toFixed(2);
    await this.notifications.create({
      userId: contract.freelancerId,
      type: NotificationType.MILESTONE_PAID,
      title: 'Payment released 🎉',
      body: `"${milestone.title}" approved — ${amountXlm} XLM has been released to your wallet (tx: ${txHash.slice(0, 10)}…).`,
      contractId,
      milestoneId,
    });

    // Also notify the client for their own records
    await this.notifications.create({
      userId: contract.clientId,
      type: NotificationType.MILESTONE_APPROVED,
      title: 'Milestone approved',
      body: `You approved "${milestone.title}" on contract "${contract.job.title}". Payment sent on Stellar.`,
      contractId,
      milestoneId,
    });

    return this.prisma.milestone.findUnique({
      where: { id: milestoneId },
      include: { payment: true },
    });
  }

  /**
   * POST /contracts/:id/dispute
   *
   * 1. Validate the caller is a party to the contract and it is ACTIVE.
   * 2. Submit dispute() on-chain — this freezes the escrow.
   * 3. Only after the on-chain call succeeds, update the DB status to DISPUTED.
   */
  async dispute(contractId: string, callerId: string, reason: string) {
    void reason; // stored off-chain in a future disputes table
    const contract = await this._getContractOrThrow(contractId);
    if (contract.clientId !== callerId && contract.freelancerId !== callerId)
      throw new ForbiddenException('Only contract parties can raise a dispute');
    if (contract.status !== ContractStatus.ACTIVE)
      throw new BadRequestException('Contract must be ACTIVE to dispute');

    if (contract.escrowTxHash) {
      await this.escrow.submitDispute(contractId);
    }

    const updated = await this.prisma.contract.update({
      where: { id: contractId },
      data: { status: ContractStatus.DISPUTED },
    });

    // Determine the other party
    const otherPartyId =
      callerId === contract.clientId
        ? contract.freelancerId
        : contract.clientId;

    // Notify both parties
    await Promise.all([
      this.notifications.create({
        userId: otherPartyId,
        type: NotificationType.DISPUTE_RAISED,
        title: 'Dispute raised on your contract',
        body: `A dispute has been raised on contract "${contract.job.title}". Escrow is frozen pending admin review.`,
        contractId,
      }),
      this.notifications.create({
        userId: callerId,
        type: NotificationType.DISPUTE_RAISED,
        title: 'Dispute submitted',
        body: `Your dispute on "${contract.job.title}" has been submitted. An admin will review it shortly.`,
        contractId,
      }),
    ]);

    return updated;
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

    // Notify both parties about the resolution
    const outcomeText =
      dto.decision === 'release'
        ? 'Funds released to freelancer'
        : dto.decision === 'refund'
          ? 'Funds refunded to client'
          : `Funds split (${dto.freelancerBps ?? 0} bps to freelancer)`;

    await Promise.all([
      this.notifications.create({
        userId: contract.clientId,
        type: NotificationType.DISPUTE_RESOLVED,
        title: 'Dispute resolved',
        body: `The dispute on "${contract.job.title}" has been resolved. ${outcomeText}.`,
        contractId,
      }),
      this.notifications.create({
        userId: contract.freelancerId,
        type: NotificationType.DISPUTE_RESOLVED,
        title: 'Dispute resolved',
        body: `The dispute on "${contract.job.title}" has been resolved. ${outcomeText}.`,
        contractId,
      }),
    ]);

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

    // Notify both parties about cancellation
    await Promise.all([
      this.notifications.create({
        userId: contract.freelancerId,
        type: NotificationType.CONTRACT_CANCELLED,
        title: 'Contract cancelled',
        body: `The contract for "${contract.job.title}" has been cancelled.${txHash ? ' Any escrowed funds have been refunded.' : ''}`,
        contractId,
      }),
      this.notifications.create({
        userId: contract.clientId,
        type: NotificationType.CONTRACT_CANCELLED,
        title: 'Contract cancelled',
        body: `Your contract for "${contract.job.title}" has been cancelled.${txHash ? ' Escrowed funds refunded on Stellar.' : ''}`,
        contractId,
      }),
    ]);

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
    const contract = await this._getContractOrThrow(contractId);
    const milestones = contract.milestones;
    if (milestones.every((m) => m.status === MilestoneStatus.PAID)) {
      await this.prisma.contract.update({
        where: { id: contractId },
        data: { status: ContractStatus.COMPLETED },
      });

      // Notify both parties that all milestones are paid and contract is complete
      await Promise.all([
        this.notifications.create({
          userId: contract.freelancerId,
          type: NotificationType.CONTRACT_COMPLETED,
          title: 'Contract completed 🎉',
          body: `All milestones on "${contract.job.title}" have been paid. Contract is now complete.`,
          contractId,
        }),
        this.notifications.create({
          userId: contract.clientId,
          type: NotificationType.CONTRACT_COMPLETED,
          title: 'Contract completed',
          body: `All milestones on "${contract.job.title}" have been paid. Contract is now complete.`,
          contractId,
        }),
      ]);
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
    const SCALE = 10_000_000;
    const totalCents = milestones.reduce((s, m) => {
      return s + Math.round(parseFloat(m.amount.toString()) * SCALE);
    }, 0);
    const paidCents = payments.reduce((s, p) => {
      return s + Math.round(parseFloat(p.amount.toString()) * SCALE);
    }, 0);
    return Math.max(0, (totalCents - paidCents) / SCALE);
  }
}
