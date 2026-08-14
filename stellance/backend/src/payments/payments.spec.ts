import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as StellarSdk from '@stellar/stellar-sdk';
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
/** A valid Ed25519 public key generated at module load time. */
const VALID_DEST = StellarSdk.Keypair.random().publicKey();

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

// ---------------------------------------------------------------------------
// Helpers for Horizon mocking
// ---------------------------------------------------------------------------

/**
 * Builds a minimal mock Horizon server and patches PaymentsService so
 * horizonServer() returns it.  Returns the mock for per-test customisation.
 */
function mockHorizon(svc: PaymentsService) {
  const accountsCall = jest.fn();
  const accountsAccountId = jest.fn().mockReturnValue({ call: accountsCall });
  const loadAccount = jest.fn();
  const fetchBaseFee = jest.fn().mockResolvedValue(100);
  const submitTransaction = jest.fn();

  const server = {
    accounts: jest.fn().mockReturnValue({ accountId: accountsAccountId }),
    loadAccount,
    fetchBaseFee,
    submitTransaction,
  };

  // Replace the private horizonServer() factory on the instance
  jest
    .spyOn(svc as unknown as { horizonServer: () => unknown }, 'horizonServer')
    .mockReturnValue(server as unknown as StellarSdk.Horizon.Server);

  return { server, accountsCall, loadAccount, fetchBaseFee, submitTransaction };
}

// ---------------------------------------------------------------------------
// PaymentsService — getBalances() Horizon paths
// ---------------------------------------------------------------------------

describe('PaymentsService — getBalances() Horizon paths', () => {
  it('returns XLM and USDC balances when both trustlines exist', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      stellarPublicKey: STELLAR_KEY,
    });

    const svc = makeService();
    const { accountsCall } = mockHorizon(svc);
    accountsCall.mockResolvedValue({
      balances: [
        { asset_type: 'native', balance: '42.5000000' },
        {
          asset_type: 'credit_alphanum4',
          asset_code: 'USDC',
          asset_issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
          balance: '100.00',
        },
      ],
    });

    const result = await svc.getBalances(CLIENT_ID);

    expect(result).toHaveLength(2);
    expect(result.find((b) => b.asset === 'XLM')!.balance).toBe('42.5000000');
    expect(result.find((b) => b.asset === 'USDC')!.balance).toBe('100.00');
    expect(result.every((b) => b.network === 'testnet')).toBe(true);
  });

  it('fills in zero USDC when the account has no USDC trustline', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      stellarPublicKey: STELLAR_KEY,
    });

    const svc = makeService();
    const { accountsCall } = mockHorizon(svc);
    accountsCall.mockResolvedValue({
      balances: [{ asset_type: 'native', balance: '10.0000000' }],
    });

    const result = await svc.getBalances(CLIENT_ID);

    expect(result).toHaveLength(2);
    expect(result.find((b) => b.asset === 'USDC')!.balance).toBe('0.00');
  });

  it('ignores USDC from an unknown issuer on testnet', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      stellarPublicKey: STELLAR_KEY,
    });

    const svc = makeService();
    const { accountsCall } = mockHorizon(svc);
    accountsCall.mockResolvedValue({
      balances: [
        { asset_type: 'native', balance: '5.0000000' },
        {
          asset_type: 'credit_alphanum4',
          asset_code: 'USDC',
          asset_issuer: 'GUNKNOWNISSUERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          balance: '999.00',
        },
      ],
    });

    const result = await svc.getBalances(CLIENT_ID);

    // The USDC from the wrong issuer should be ignored → zero USDC returned
    expect(result.find((b) => b.asset === 'USDC')!.balance).toBe('0.00');
  });

  it('returns zero balances when Horizon throws NotFoundError (unfunded account)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      stellarPublicKey: STELLAR_KEY,
    });

    const svc = makeService();
    const { accountsCall } = mockHorizon(svc);
    // Simulate a Horizon 404 via NotFoundError
    accountsCall.mockRejectedValue(
      new StellarSdk.NotFoundError(
        { status: 404, statusText: 'Not Found', url: '', headers: {}, body: '' } as unknown as Response,
        'account not found',
      ),
    );

    const result = await svc.getBalances(CLIENT_ID);

    expect(result).toHaveLength(2);
    expect(result.find((b) => b.asset === 'XLM')!.balance).toBe('0.0000000');
    expect(result.find((b) => b.asset === 'USDC')!.balance).toBe('0.00');
  });

  it('returns zero balances when Horizon throws a NetworkError with status 404', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      stellarPublicKey: STELLAR_KEY,
    });

    const svc = makeService();
    const { accountsCall } = mockHorizon(svc);

    const networkErr = new StellarSdk.NetworkError(
      'connection timeout',
      { status: 404 } as unknown as Response,
    );
    accountsCall.mockRejectedValue(networkErr);

    const result = await svc.getBalances(CLIENT_ID);

    expect(result).toHaveLength(2);
    expect(result.find((b) => b.asset === 'XLM')!.balance).toBe('0.0000000');
  });

  it('throws ServiceUnavailableException for a generic Horizon error', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      stellarPublicKey: STELLAR_KEY,
    });

    const svc = makeService();
    const { accountsCall } = mockHorizon(svc);
    accountsCall.mockRejectedValue(new Error('connection refused'));

    await expect(svc.getBalances(CLIENT_ID)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});

// ---------------------------------------------------------------------------
// PaymentsService — withdraw()
// ---------------------------------------------------------------------------

describe('PaymentsService — withdraw()', () => {
  const validParams = {
    userId: CLIENT_ID,
    asset: 'XLM' as const,
    amount: '10',
    destinationAddress: VALID_DEST,
  };

  it('throws BadRequestException for an invalid Stellar address', async () => {
    const svc = makeService();
    await expect(
      svc.withdraw({ ...validParams, destinationAddress: 'not-a-key' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException for a zero amount', async () => {
    const svc = makeService();
    await expect(
      svc.withdraw({ ...validParams, amount: '0' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException for a negative amount', async () => {
    const svc = makeService();
    await expect(
      svc.withdraw({ ...validParams, amount: '-5' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException for a non-XLM asset', async () => {
    const svc = makeService();
    await expect(
      svc.withdraw({ ...validParams, asset: 'USDC' as 'XLM' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws ServiceUnavailableException when STELLAR_ADMIN_SECRET is missing', async () => {
    // Config already returns undefined for STELLAR_ADMIN_SECRET by default
    const svc = makeService();
    await expect(svc.withdraw(validParams)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it('returns a WITHDRAWAL PaymentTransaction on success', async () => {
    // Provide a real testnet keypair so Keypair.fromSecret doesn't throw
    const adminKeypair = StellarSdk.Keypair.random();
    mockConfig.get.mockImplementation((key: string) => {
      if (key === 'STELLAR_NETWORK') return 'testnet';
      if (key === 'STELLAR_ADMIN_SECRET') return adminKeypair.secret();
      return undefined;
    });

    const svc = makeService();
    const { loadAccount, fetchBaseFee, submitTransaction } = mockHorizon(svc);

    // Mock a minimal AccountResponse so TransactionBuilder can work
    loadAccount.mockResolvedValue(
      new StellarSdk.Account(adminKeypair.publicKey(), '1'),
    );
    fetchBaseFee.mockResolvedValue(100);
    submitTransaction.mockResolvedValue({ hash: 'withdraw-tx-hash-abc' });

    const result = await svc.withdraw(validParams);

    expect(result.type).toBe('WITHDRAWAL');
    expect(result.status).toBe('CONFIRMED');
    expect(result.stellarTxHash).toBe('withdraw-tx-hash-abc');
    expect(result.asset).toBe('XLM');
    expect(result.amount.startsWith('-')).toBe(true);
  });

  it('throws ServiceUnavailableException when Horizon submit fails', async () => {
    const adminKeypair = StellarSdk.Keypair.random();
    mockConfig.get.mockImplementation((key: string) => {
      if (key === 'STELLAR_NETWORK') return 'testnet';
      if (key === 'STELLAR_ADMIN_SECRET') return adminKeypair.secret();
      return undefined;
    });

    const svc = makeService();
    const { loadAccount, fetchBaseFee, submitTransaction } = mockHorizon(svc);

    loadAccount.mockResolvedValue(
      new StellarSdk.Account(adminKeypair.publicKey(), '1'),
    );
    fetchBaseFee.mockResolvedValue(100);
    submitTransaction.mockRejectedValue(new Error('tx failed'));

    await expect(svc.withdraw(validParams)).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});

// ---------------------------------------------------------------------------
// PaymentsController — new endpoints (balances, transactions, earnings, withdraw)
// ---------------------------------------------------------------------------

describe('PaymentsController — new endpoints', () => {
  function makeAuthReq(id = CLIENT_ID): AuthRequest {
    return { user: { id, role: UserRole.CLIENT } } as unknown as AuthRequest;
  }

  // We use jest.spyOn on the service so we can keep makeService()/makeController()
  // as-is and still control return values per test.

  it('getBalances() delegates to PaymentsService.getBalances with caller id', async () => {
    const expected = [
      { asset: 'XLM', balance: '5.0000000', network: 'testnet' },
      { asset: 'USDC', balance: '0.00', network: 'testnet' },
    ];
    mockPrisma.user.findUnique.mockResolvedValue({ stellarPublicKey: null });

    const ctrl = makeController();
    // Spy on the internal service instance
    const spy = jest
      .spyOn(ctrl['paymentsService'], 'getBalances')
      .mockResolvedValue(expected as never);

    const result = await ctrl.getBalances(makeAuthReq());

    expect(spy).toHaveBeenCalledWith(CLIENT_ID);
    expect(result).toBe(expected);
  });

  it('getTransactions() delegates to PaymentsService.getTransactions with caller id', async () => {
    const expected = [{ id: 'tx-1', type: 'FULL_RELEASE' }];
    const ctrl = makeController();
    const spy = jest
      .spyOn(ctrl['paymentsService'], 'getTransactions')
      .mockResolvedValue(expected as never);

    const result = await ctrl.getTransactions(makeAuthReq());

    expect(spy).toHaveBeenCalledWith(CLIENT_ID);
    expect(result).toBe(expected);
  });

  it('getEarnings() delegates to PaymentsService.getEarnings with caller id', async () => {
    const expected = {
      totalEarned: '0.0000000',
      currency: 'XLM',
      paymentCount: 0,
      byContract: [],
    };
    const ctrl = makeController();
    const spy = jest
      .spyOn(ctrl['paymentsService'], 'getEarnings')
      .mockResolvedValue(expected);

    const result = await ctrl.getEarnings(makeAuthReq());

    expect(spy).toHaveBeenCalledWith(CLIENT_ID);
    expect(result).toBe(expected);
  });

  it('withdraw() delegates to PaymentsService.withdraw with caller id + dto fields', async () => {
    const txResult = {
      id: 'withdraw_123',
      createdAt: new Date().toISOString(),
      type: 'WITHDRAWAL' as const,
      status: 'CONFIRMED' as const,
      asset: 'XLM' as const,
      amount: '-10.0000000',
      description: 'Withdrawal to GDQERE…RDWI',
      stellarTxHash: 'hash-xyz',
      counterparty: VALID_DEST,
      contractId: null,
    };

    const ctrl = makeController();
    const spy = jest
      .spyOn(ctrl['paymentsService'], 'withdraw')
      .mockResolvedValue(txResult);

    const dto = { asset: 'XLM' as const, amount: '10', destinationAddress: VALID_DEST };
    const result = await ctrl.withdraw(makeAuthReq(), dto);

    expect(spy).toHaveBeenCalledWith({
      userId: CLIENT_ID,
      asset: 'XLM',
      amount: '10',
      destinationAddress: VALID_DEST,
    });
    expect(result).toBe(txResult);
  });
});

// Type alias used in the controller test block above
type AuthRequest = Request & { user: { id: string; role: UserRole } };
