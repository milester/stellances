import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '../generated/prisma/client';
import type { Request } from 'express';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CONTRACT_ID = 'contract-001';
const CLIENT_ID = 'client-001';
const FREELANCER_ID = 'freelancer-001';
const TX_HASH = 'abc123deadbeef';
const STELLAR_KEY = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

const basePayment = {
  id: 'payment-001',
  contractId: CONTRACT_ID,
  milestoneId: 'milestone-001',
  amount: { toString: () => '100.0000000' } as unknown as import('../generated/prisma/client').Prisma.Decimal,
  stellarTxHash: TX_HASH,
  createdAt: new Date('2026-01-01'),
};

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

const mockPrisma = {
  payment: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  contract: {
    findUnique: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
};

/**
 * ConfigService mock — returns testnet defaults so the service constructor
 * doesn't throw. Tests that need specific config values can override get().
 */
const mockConfig = {
  get: jest.fn((key: string) => {
    if (key === 'STELLAR_NETWORK') return 'testnet';
    return undefined;
  }),
};

function makeService(): PaymentsService {
  return new PaymentsService(
    mockPrisma as unknown as PrismaService,
    mockConfig as unknown as ConfigService,
  );
}

function makeController(): PaymentsController {
  return new PaymentsController(
    makeService(),
    mockPrisma as unknown as PrismaService,
  );
}

function makeReq(id: string, role: UserRole): { user: { id: string; role: UserRole } } {
  return { user: { id, role } };
}

beforeEach(() => {
  jest.clearAllMocks();
  // Re-apply default config mock after clearAllMocks resets the implementation
  mockConfig.get.mockImplementation((key: string) => {
    if (key === 'STELLAR_NETWORK') return 'testnet';
    return undefined;
  });
});

// ---------------------------------------------------------------------------
// PaymentsService — findByContract / findByTxHash (legacy read methods)
// ---------------------------------------------------------------------------

describe('PaymentsService', () => {
  describe('findByContract()', () => {
    it('returns mapped payment summaries', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([basePayment]);

      const svc = makeService();
      const result = await svc.findByContract(CONTRACT_ID);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('payment-001');
      expect(result[0].amount).toBe('100.0000000');
      expect(result[0].stellarTxHash).toBe(TX_HASH);
    });

    it('returns empty array when no payments exist', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([]);

      const svc = makeService();
      const result = await svc.findByContract(CONTRACT_ID);
      expect(result).toEqual([]);
    });

    it('maps null milestoneId correctly', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([
        { ...basePayment, milestoneId: null },
      ]);

      const svc = makeService();
      const result = await svc.findByContract(CONTRACT_ID);
      expect(result[0].milestoneId).toBeNull();
    });
  });

  describe('findByTxHash()', () => {
    it('returns payment summary when found', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(basePayment);

      const svc = makeService();
      const result = await svc.findByTxHash(TX_HASH);

      expect(result).not.toBeNull();
      expect(result!.stellarTxHash).toBe(TX_HASH);
    });

    it('returns null when payment does not exist', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(null);

      const svc = makeService();
      const result = await svc.findByTxHash('nonexistent');
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // getBalances()
  // -------------------------------------------------------------------------

  describe('getBalances()', () => {
    it('returns zero balances when user has no stellarPublicKey', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        stellarPublicKey: null,
      });

      const svc = makeService();
      const result = await svc.getBalances(CLIENT_ID);

      expect(result).toHaveLength(2);
      expect(result.find((b) => b.asset === 'XLM')!.balance).toBe('0.0000000');
      expect(result.find((b) => b.asset === 'USDC')!.balance).toBe('0.00');
    });

    it('returns zero balances when user is not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const svc = makeService();
      const result = await svc.getBalances(CLIENT_ID);

      expect(result).toHaveLength(2);
      expect(result.every((b) => b.network === 'testnet')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // getTransactions()
  // -------------------------------------------------------------------------

  describe('getTransactions()', () => {
    const contractWithRelations = {
      id: CONTRACT_ID,
      clientId: CLIENT_ID,
      freelancerId: FREELANCER_ID,
      client: { stellarPublicKey: STELLAR_KEY },
      freelancer: { stellarPublicKey: null },
      job: { title: 'Build a DeFi dashboard' },
    };

    it('maps a milestone payment to MILESTONE_RELEASED for the freelancer', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([
        {
          ...basePayment,
          contract: contractWithRelations,
          milestone: { title: 'Phase 1 — design' },
        },
      ]);

      const svc = makeService();
      const result = await svc.getTransactions(FREELANCER_ID);

      expect(result).toHaveLength(1);
      const tx = result[0];
      expect(tx.type).toBe('MILESTONE_RELEASED');
      expect(tx.status).toBe('CONFIRMED');
      // Freelancer receives — positive amount
      expect(tx.amount.startsWith('+')).toBe(true);
      expect(tx.description).toContain('Phase 1');
      expect(tx.stellarTxHash).toBe(TX_HASH);
      expect(tx.contractId).toBe(CONTRACT_ID);
    });

    it('shows negative amount for the client (paid out)', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([
        {
          ...basePayment,
          contract: contractWithRelations,
          milestone: { title: 'Phase 1' },
        },
      ]);

      const svc = makeService();
      const result = await svc.getTransactions(CLIENT_ID);

      expect(result[0].amount.startsWith('-')).toBe(true);
    });

    it('maps a non-milestone payment to FULL_RELEASE', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([
        {
          ...basePayment,
          milestoneId: null,
          contract: contractWithRelations,
          milestone: null,
        },
      ]);

      const svc = makeService();
      const result = await svc.getTransactions(FREELANCER_ID);

      expect(result[0].type).toBe('FULL_RELEASE');
    });

    it('returns empty array when user has no payments', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([]);

      const svc = makeService();
      const result = await svc.getTransactions(CLIENT_ID);
      expect(result).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // getEarnings()
  // -------------------------------------------------------------------------

  describe('getEarnings()', () => {
    it('returns aggregate totals for a freelancer', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([
        {
          id: 'p1',
          contractId: CONTRACT_ID,
          milestoneId: 'ms-1',
          amount: { toString: () => '500.0000000' },
          stellarTxHash: 'hash1',
          createdAt: new Date(),
          contract: { id: CONTRACT_ID, job: { title: 'Backend API' } },
        },
        {
          id: 'p2',
          contractId: CONTRACT_ID,
          milestoneId: 'ms-2',
          amount: { toString: () => '250.0000000' },
          stellarTxHash: 'hash2',
          createdAt: new Date(),
          contract: { id: CONTRACT_ID, job: { title: 'Backend API' } },
        },
      ]);

      const svc = makeService();
      const result = await svc.getEarnings(FREELANCER_ID);

      expect(result.paymentCount).toBe(2);
      expect(parseFloat(result.totalEarned)).toBeCloseTo(750, 4);
      expect(result.currency).toBe('XLM');
      expect(result.byContract).toHaveLength(1);
      expect(result.byContract[0].contractId).toBe(CONTRACT_ID);
      expect(parseFloat(result.byContract[0].amount)).toBeCloseTo(750, 4);
    });

    it('returns zero totals when freelancer has no payments', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([]);

      const svc = makeService();
      const result = await svc.getEarnings(FREELANCER_ID);

      expect(result.paymentCount).toBe(0);
      expect(result.totalEarned).toBe('0.0000000');
      expect(result.byContract).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// PaymentsController — existing routes
// ---------------------------------------------------------------------------

describe('PaymentsController', () => {
  describe('GET /payments/contracts/:contractId', () => {
    it('returns payments for a client on their own contract', async () => {
      mockPrisma.contract.findUnique.mockResolvedValue({
        clientId: CLIENT_ID,
        freelancerId: FREELANCER_ID,
      });
      mockPrisma.payment.findMany.mockResolvedValue([basePayment]);

      const ctrl = makeController();
      const result = await ctrl.findByContract(
        CONTRACT_ID,
        makeReq(CLIENT_ID, UserRole.CLIENT) as unknown as Request,
      );
      expect(result).toHaveLength(1);
    });

    it('returns payments for the freelancer on the contract', async () => {
      mockPrisma.contract.findUnique.mockResolvedValue({
        clientId: CLIENT_ID,
        freelancerId: FREELANCER_ID,
      });
      mockPrisma.payment.findMany.mockResolvedValue([basePayment]);

      const ctrl = makeController();
      const result = await ctrl.findByContract(
        CONTRACT_ID,
        makeReq(FREELANCER_ID, UserRole.FREELANCER) as unknown as Request,
      );
      expect(result).toHaveLength(1);
    });

    it('returns payments for an admin regardless of party membership', async () => {
      mockPrisma.contract.findUnique.mockResolvedValue({
        clientId: CLIENT_ID,
        freelancerId: FREELANCER_ID,
      });
      mockPrisma.payment.findMany.mockResolvedValue([basePayment]);

      const ctrl = makeController();
      const result = await ctrl.findByContract(
        CONTRACT_ID,
        makeReq('admin-001', UserRole.ADMIN) as unknown as Request,
      );
      expect(result).toHaveLength(1);
    });

    it('throws NotFoundException when contract does not exist', async () => {
      mockPrisma.contract.findUnique.mockResolvedValue(null);

      const ctrl = makeController();
      await expect(
        ctrl.findByContract(
          'ghost-id',
          makeReq(CLIENT_ID, UserRole.CLIENT) as unknown as Request,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for a non-party user', async () => {
      mockPrisma.contract.findUnique.mockResolvedValue({
        clientId: CLIENT_ID,
        freelancerId: FREELANCER_ID,
      });

      const ctrl = makeController();
      await expect(
        ctrl.findByContract(
          CONTRACT_ID,
          makeReq('stranger-001', UserRole.FREELANCER) as unknown as Request,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('GET /payments/tx/:txHash', () => {
    it('returns payment when found by tx hash', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(basePayment);

      const ctrl = makeController();
      const result = await ctrl.findByTxHash(TX_HASH);
      expect(result.stellarTxHash).toBe(TX_HASH);
    });

    it('throws NotFoundException when tx hash has no matching payment', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(null);

      const ctrl = makeController();
      await expect(ctrl.findByTxHash('unknown-hash')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
