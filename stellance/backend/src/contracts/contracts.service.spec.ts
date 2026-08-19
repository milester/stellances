/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ContractsService } from './contracts.service';
import { PrismaService } from '../prisma/prisma.service';
import { EscrowService } from '../escrow/escrow.service';
import {
  ContractStatus,
  JobStatus,
  MilestoneStatus,
  UserRole,
} from '../generated/prisma/client';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CLIENT_ID = 'client-001';
const FREELANCER_ID = 'freelancer-001';
const ADMIN_ID = 'admin-001';
const JOB_ID = 'job-001';
const CONTRACT_ID = 'contract-001';
const MILESTONE_ID = 'milestone-001';

const baseContract = {
  id: CONTRACT_ID,
  jobId: JOB_ID,
  clientId: CLIENT_ID,
  freelancerId: FREELANCER_ID,
  status: ContractStatus.ACTIVE,
  escrowTxHash: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  milestones: [],
  payments: [],
  job: { id: JOB_ID, title: 'Build escrow', status: JobStatus.IN_PROGRESS },
  client: { id: CLIENT_ID, name: 'Alice', stellarPublicKey: 'GCLIENT...' },
  freelancer: {
    id: FREELANCER_ID,
    name: 'Bob',
    stellarPublicKey: 'GFREELANCER...',
  },
};

const pendingMilestone = {
  id: MILESTONE_ID,
  contractId: CONTRACT_ID,
  title: 'Milestone 1',
  amount: { toString: () => '500.0000000' },
  status: MilestoneStatus.PENDING,
  createdAt: new Date(),
  updatedAt: new Date(),
  payment: null,
};

const inReviewMilestone = {
  ...pendingMilestone,
  status: MilestoneStatus.IN_REVIEW,
};

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

function makePrismaMock() {
  return {
    job: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    contract: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    milestone: {
      createMany: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    payment: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          contract: {
            create: jest.fn().mockResolvedValue(baseContract),
            update: jest.fn(),
          },
          milestone: { createMany: jest.fn(), update: jest.fn() },
          job: { update: jest.fn() },
          payment: { create: jest.fn() },
        }),
      ),
  };
}

function makeEscrowMock() {
  return {
    getAdminPublicKey: jest.fn().mockReturnValue('GADMIN...'),
    buildFundXdr: jest.fn().mockResolvedValue('xdr-base64...'),
    verifyTransaction: jest.fn().mockResolvedValue({ ledger: 123 }),
    submitReleaseMilestone: jest.fn().mockResolvedValue('tx-hash-release'),
    submitRelease: jest.fn().mockResolvedValue('tx-hash-release-all'),
    submitRefund: jest.fn().mockResolvedValue('tx-hash-refund'),
    submitDispute: jest.fn().mockResolvedValue('tx-hash-dispute'),
    submitResolveDispute: jest.fn().mockResolvedValue('tx-hash-resolve'),
  };
}

/** Stub out NotificationsService — contracts tests don't assert on notifications. */
function makeNotificationsMock() {
  return {
    create: jest.fn().mockResolvedValue(undefined),
  };
}

function setup() {
  const prisma = makePrismaMock();
  const escrow = makeEscrowMock();
  const notifications = makeNotificationsMock();
  // ConfigService mock — returns undefined for any key so the service uses
  // its built-in fallback values (testnet defaults).
  const config = { get: jest.fn().mockReturnValue(undefined) };
  const service = new ContractsService(
    prisma as unknown as PrismaService,
    escrow as unknown as EscrowService,
    config as unknown as import('@nestjs/config').ConfigService,
    notifications as unknown as import('../notifications/notifications.service').NotificationsService,
  );
  return { prisma, escrow, notifications, service };
}

// ---------------------------------------------------------------------------
// create()
// ---------------------------------------------------------------------------

describe('ContractsService', () => {
  describe('create', () => {
    it('throws NotFoundException when job does not exist', async () => {
      const { prisma, service } = setup();
      prisma.job.findUnique.mockResolvedValue(null);

      await expect(
        service.create(CLIENT_ID, {
          jobId: JOB_ID,
          freelancerId: FREELANCER_ID,
          milestones: [{ title: 'M1', amount: 500 }],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when caller does not own the job', async () => {
      const { prisma, service } = setup();
      prisma.job.findUnique.mockResolvedValue({
        id: JOB_ID,
        clientId: 'other-client',
        status: JobStatus.OPEN,
        contract: null,
      });

      await expect(
        service.create(CLIENT_ID, {
          jobId: JOB_ID,
          freelancerId: FREELANCER_ID,
          milestones: [{ title: 'M1', amount: 500 }],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws BadRequestException when job is not OPEN', async () => {
      const { prisma, service } = setup();
      prisma.job.findUnique.mockResolvedValue({
        id: JOB_ID,
        clientId: CLIENT_ID,
        status: JobStatus.IN_PROGRESS,
        contract: null,
      });

      await expect(
        service.create(CLIENT_ID, {
          jobId: JOB_ID,
          freelancerId: FREELANCER_ID,
          milestones: [{ title: 'M1', amount: 500 }],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws ConflictException when job already has a contract', async () => {
      const { prisma, service } = setup();
      prisma.job.findUnique.mockResolvedValue({
        id: JOB_ID,
        clientId: CLIENT_ID,
        status: JobStatus.OPEN,
        contract: { id: CONTRACT_ID },
      });

      await expect(
        service.create(CLIENT_ID, {
          jobId: JOB_ID,
          freelancerId: FREELANCER_ID,
          milestones: [{ title: 'M1', amount: 500 }],
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  // ---------------------------------------------------------------------------
  // confirmFund()
  // ---------------------------------------------------------------------------

  describe('confirmFund', () => {
    it('throws ForbiddenException when caller is not the client', async () => {
      const { prisma, service } = setup();
      prisma.contract.findUnique.mockResolvedValue(baseContract);

      await expect(
        service.confirmFund(CONTRACT_ID, FREELANCER_ID, 'tx-hash'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws ConflictException when escrow already confirmed', async () => {
      const { prisma, service } = setup();
      prisma.contract.findUnique.mockResolvedValue({
        ...baseContract,
        escrowTxHash: 'existing-hash',
      });

      await expect(
        service.confirmFund(CONTRACT_ID, CLIENT_ID, 'tx-hash'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('verifies tx hash on Horizon and saves it', async () => {
      const { prisma, escrow, service } = setup();
      prisma.contract.findUnique.mockResolvedValue(baseContract);
      prisma.contract.update.mockResolvedValue({
        ...baseContract,
        escrowTxHash: 'new-hash',
      });

      const result = await service.confirmFund(
        CONTRACT_ID,
        CLIENT_ID,
        'new-hash',
      );

      expect(escrow.verifyTransaction).toHaveBeenCalledWith('new-hash');
      expect(prisma.contract.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ escrowTxHash: 'new-hash' }),
        }),
      );
      expect(result.escrowTxHash).toBe('new-hash');
    });
  });

  // ---------------------------------------------------------------------------
  // submitMilestone()
  // ---------------------------------------------------------------------------

  describe('submitMilestone', () => {
    it('throws ForbiddenException when caller is not the freelancer', async () => {
      const { prisma, service } = setup();
      prisma.contract.findUnique.mockResolvedValue({
        ...baseContract,
        milestones: [pendingMilestone],
      });

      await expect(
        service.submitMilestone(CONTRACT_ID, MILESTONE_ID, CLIENT_ID),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws BadRequestException when milestone is not PENDING', async () => {
      const { prisma, service } = setup();
      prisma.contract.findUnique.mockResolvedValue({
        ...baseContract,
        milestones: [inReviewMilestone],
      });

      await expect(
        service.submitMilestone(CONTRACT_ID, MILESTONE_ID, FREELANCER_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('moves milestone to IN_REVIEW', async () => {
      const { prisma, service } = setup();
      prisma.contract.findUnique.mockResolvedValue({
        ...baseContract,
        milestones: [pendingMilestone],
      });
      prisma.milestone.update.mockResolvedValue({
        ...pendingMilestone,
        status: MilestoneStatus.IN_REVIEW,
      });

      const result = await service.submitMilestone(
        CONTRACT_ID,
        MILESTONE_ID,
        FREELANCER_ID,
      );

      expect(result.status).toBe(MilestoneStatus.IN_REVIEW);
    });
  });

  // ---------------------------------------------------------------------------
  // approveMilestone() — the bug-fixed version
  // ---------------------------------------------------------------------------

  describe('approveMilestone', () => {
    it('throws ForbiddenException when caller is not the client', async () => {
      const { prisma, service } = setup();
      prisma.contract.findUnique.mockResolvedValue({
        ...baseContract,
        milestones: [inReviewMilestone],
      });

      await expect(
        service.approveMilestone(CONTRACT_ID, MILESTONE_ID, FREELANCER_ID),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws BadRequestException when milestone is not IN_REVIEW', async () => {
      const { prisma, service } = setup();
      prisma.contract.findUnique.mockResolvedValue({
        ...baseContract,
        milestones: [pendingMilestone],
      });

      await expect(
        service.approveMilestone(CONTRACT_ID, MILESTONE_ID, CLIENT_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('calls submitReleaseMilestone BEFORE writing DB state', async () => {
      const { prisma, escrow, service } = setup();
      prisma.contract.findUnique.mockResolvedValue({
        ...baseContract,
        milestones: [inReviewMilestone],
      });
      prisma.milestone.findMany.mockResolvedValue([
        { ...inReviewMilestone, status: MilestoneStatus.PAID },
      ]);
      prisma.milestone.findUnique.mockResolvedValue({
        ...inReviewMilestone,
        status: MilestoneStatus.PAID,
        payment: { stellarTxHash: 'tx-hash-release' },
      });

      const callOrder: string[] = [];
      escrow.submitReleaseMilestone.mockImplementation(() => {
        callOrder.push('soroban');
        return Promise.resolve('tx-hash-release');
      });
      prisma.$transaction.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          callOrder.push('db-commit');
          return fn({
            milestone: { update: jest.fn() },
            payment: { create: jest.fn() },
          });
        },
      );

      await service.approveMilestone(CONTRACT_ID, MILESTONE_ID, CLIENT_ID);

      // Critical: Soroban must be called before the DB transaction
      expect(callOrder[0]).toBe('soroban');
      expect(callOrder[1]).toBe('db-commit');
    });

    it('milestone stays IN_REVIEW if Soroban call fails (no stuck APPROVED state)', async () => {
      const { prisma, escrow, service } = setup();
      prisma.contract.findUnique.mockResolvedValue({
        ...baseContract,
        milestones: [inReviewMilestone],
      });
      escrow.submitReleaseMilestone.mockRejectedValue(
        new Error('Soroban RPC unreachable'),
      );

      await expect(
        service.approveMilestone(CONTRACT_ID, MILESTONE_ID, CLIENT_ID),
      ).rejects.toThrow('Soroban RPC unreachable');

      // The DB transaction must NOT have been called — milestone stays IN_REVIEW
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // dispute()
  // ---------------------------------------------------------------------------

  describe('dispute', () => {
    it('throws ForbiddenException for non-party callers', async () => {
      const { prisma, service } = setup();
      prisma.contract.findUnique.mockResolvedValue(baseContract);

      await expect(
        service.dispute(CONTRACT_ID, 'stranger-id', 'reason'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('sets contract status to DISPUTED without calling Soroban when escrow is not funded', async () => {
      const { prisma, escrow, service } = setup();
      prisma.contract.findUnique.mockResolvedValue({
        ...baseContract,
        escrowTxHash: null,
      });
      prisma.contract.update.mockResolvedValue({
        ...baseContract,
        status: ContractStatus.DISPUTED,
      });

      const result = await service.dispute(CONTRACT_ID, CLIENT_ID, 'reason');

      expect(result.status).toBe(ContractStatus.DISPUTED);
      // No on-chain escrow yet — submitDispute must NOT be called
      expect(escrow.submitDispute).not.toHaveBeenCalled();
    });

    it('calls submitDispute on-chain BEFORE writing DB when escrow is funded', async () => {
      const { prisma, escrow, service } = setup();
      prisma.contract.findUnique.mockResolvedValue({
        ...baseContract,
        escrowTxHash: 'funded-hash',
      });
      prisma.contract.update.mockResolvedValue({
        ...baseContract,
        status: ContractStatus.DISPUTED,
      });

      const callOrder: string[] = [];
      escrow.submitDispute.mockImplementation(() => {
        callOrder.push('soroban');
        return Promise.resolve('tx-hash-dispute');
      });
      prisma.contract.update.mockImplementation(() => {
        callOrder.push('db-update');
        return Promise.resolve({
          ...baseContract,
          status: ContractStatus.DISPUTED,
        });
      });

      await service.dispute(CONTRACT_ID, CLIENT_ID, 'reason');

      expect(callOrder[0]).toBe('soroban');
      expect(callOrder[1]).toBe('db-update');
      expect(escrow.submitDispute).toHaveBeenCalledWith(CONTRACT_ID);
    });

    it('does not update DB if Soroban dispute() call fails', async () => {
      const { prisma, escrow, service } = setup();
      prisma.contract.findUnique.mockResolvedValue({
        ...baseContract,
        escrowTxHash: 'funded-hash',
      });
      escrow.submitDispute.mockRejectedValue(
        new Error('Soroban RPC unreachable'),
      );

      await expect(
        service.dispute(CONTRACT_ID, CLIENT_ID, 'reason'),
      ).rejects.toThrow('Soroban RPC unreachable');

      expect(prisma.contract.update).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // resolveDispute()
  // ---------------------------------------------------------------------------

  describe('resolveDispute', () => {
    it('throws ForbiddenException for non-admin callers', async () => {
      const { prisma, service } = setup();
      prisma.contract.findUnique.mockResolvedValue({
        ...baseContract,
        status: ContractStatus.DISPUTED,
      });

      await expect(
        service.resolveDispute(CONTRACT_ID, CLIENT_ID, UserRole.CLIENT, {
          decision: 'release',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws BadRequestException when contract is not DISPUTED', async () => {
      const { prisma, service } = setup();
      prisma.contract.findUnique.mockResolvedValue(baseContract);

      await expect(
        service.resolveDispute(CONTRACT_ID, ADMIN_ID, UserRole.ADMIN, {
          decision: 'release',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('calls submitResolveDispute and returns resolved status', async () => {
      const { prisma, escrow, service } = setup();
      prisma.contract.findUnique.mockResolvedValue({
        ...baseContract,
        status: ContractStatus.DISPUTED,
      });
      prisma.milestone.findMany.mockResolvedValue([pendingMilestone]);
      prisma.payment.findMany.mockResolvedValue([]);

      const result = await service.resolveDispute(
        CONTRACT_ID,
        ADMIN_ID,
        UserRole.ADMIN,
        { decision: 'release' },
      );

      expect(escrow.submitResolveDispute).toHaveBeenCalledWith(
        expect.objectContaining({ decision: 0 }),
      );
      expect(result.resolved).toBe(true);
      expect(result.status).toBe(ContractStatus.COMPLETED);
    });
  });

  // ---------------------------------------------------------------------------
  // cancel()
  // ---------------------------------------------------------------------------

  describe('cancel', () => {
    it('throws ForbiddenException when non-client tries to cancel funded contract', async () => {
      const { prisma, service } = setup();
      prisma.contract.findUnique.mockResolvedValue({
        ...baseContract,
        escrowTxHash: 'funded-hash',
      });

      await expect(
        service.cancel(CONTRACT_ID, CLIENT_ID, UserRole.CLIENT),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('cancels unfunded contract without calling Soroban', async () => {
      const { prisma, escrow, service } = setup();
      prisma.contract.findUnique.mockResolvedValue({
        ...baseContract,
        escrowTxHash: null,
      });
      prisma.milestone.findMany.mockResolvedValue([]);
      prisma.payment.findMany.mockResolvedValue([]);

      await service.cancel(CONTRACT_ID, CLIENT_ID, UserRole.CLIENT);

      expect(escrow.submitRefund).not.toHaveBeenCalled();
    });

    it('calls submitRefund when admin cancels a funded contract', async () => {
      const { prisma, escrow, service } = setup();
      prisma.contract.findUnique.mockResolvedValue({
        ...baseContract,
        escrowTxHash: 'funded-hash',
      });
      prisma.milestone.findMany.mockResolvedValue([pendingMilestone]);
      prisma.payment.findMany.mockResolvedValue([]);

      await service.cancel(CONTRACT_ID, ADMIN_ID, UserRole.ADMIN);

      expect(escrow.submitRefund).toHaveBeenCalledWith(CONTRACT_ID);
    });
  });
});
