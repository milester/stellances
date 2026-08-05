import { NotFoundException, ForbiddenException } from '@nestjs/common';
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

const basePayment = {
  id: 'payment-001',
  contractId: CONTRACT_ID,
  milestoneId: 'milestone-001',
  amount: { toString: () => '100.0000000' } as unknown as import('../generated/prisma/client').Prisma.Decimal,
  stellarTxHash: TX_HASH,
  createdAt: new Date('2026-01-01'),
};

// ---------------------------------------------------------------------------
// Mock PrismaService
// ---------------------------------------------------------------------------

const mockPrisma = {
  payment: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  contract: {
    findUnique: jest.fn(),
  },
};

function makeService(): PaymentsService {
  return new PaymentsService(mockPrisma as unknown as PrismaService);
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
});

// ---------------------------------------------------------------------------
// PaymentsService
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
});

// ---------------------------------------------------------------------------
// PaymentsController
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
