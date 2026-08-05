/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JobStatus, UserRole } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const CLIENT_ID = 'client-uuid-001';
const JOB_ID = 'job-uuid-001';

const baseJob = {
  id: JOB_ID,
  title: 'Build Soroban escrow',
  description: 'Need a Rust dev',
  budget: '1200.0000000',
  category: 'Smart Contracts',
  status: JobStatus.OPEN,
  clientId: CLIENT_ID,
  createdAt: new Date(),
  updatedAt: new Date(),
  client: { id: CLIENT_ID, name: 'Alice', stellarPublicKey: null },
  contract: null,
};

/** Minimal typed prisma stub — only the methods JobsService actually calls. */
interface JobPrismaMock {
  create: jest.Mock;
  findMany: jest.Mock;
  findUnique: jest.Mock;
  update: jest.Mock;
}
interface PrismaStub {
  job: JobPrismaMock;
}

function makePrisma(): PrismaStub {
  return {
    job: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
}

describe('JobsService', () => {
  function setup() {
    const prisma = makePrisma();
    const service = new JobsService(prisma as unknown as PrismaService);
    return { prisma, service };
  }

  describe('findAll', () => {
    it('returns paginated results with defaults when no filters supplied', async () => {
      const { prisma, service } = setup();
      prisma.job.findMany.mockResolvedValue([baseJob]);
      prisma.job.count = jest.fn().mockResolvedValue(1);

      const result = await service.findAll();
      expect(result.data).toHaveLength(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.total).toBe(1);
      expect(result.totalPages).toBe(1);
    });

    it('applies status filter', async () => {
      const { prisma, service } = setup();
      prisma.job.findMany.mockResolvedValue([]);
      prisma.job.count = jest.fn().mockResolvedValue(0);

      await service.findAll({ status: JobStatus.OPEN });
      expect(prisma.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: JobStatus.OPEN }),
        }),
      );
    });

    it('applies clientId filter', async () => {
      const { prisma, service } = setup();
      prisma.job.findMany.mockResolvedValue([baseJob]);
      prisma.job.count = jest.fn().mockResolvedValue(1);

      await service.findAll({ clientId: CLIENT_ID });
      expect(prisma.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ clientId: CLIENT_ID }),
        }),
      );
    });

    it('applies search filter', async () => {
      const { prisma, service } = setup();
      prisma.job.findMany.mockResolvedValue([baseJob]);
      prisma.job.count = jest.fn().mockResolvedValue(1);

      await service.findAll({ search: 'soroban' });
      expect(prisma.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ OR: expect.any(Array) }),
        }),
      );
    });

    it('applies minBudget filter', async () => {
      const { prisma, service } = setup();
      prisma.job.findMany.mockResolvedValue([baseJob]);
      prisma.job.count = jest.fn().mockResolvedValue(1);

      await service.findAll({ minBudget: 500 });
      expect(prisma.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ budget: expect.objectContaining({ gte: 500 }) }),
        }),
      );
    });

    it('applies maxBudget filter', async () => {
      const { prisma, service } = setup();
      prisma.job.findMany.mockResolvedValue([baseJob]);
      prisma.job.count = jest.fn().mockResolvedValue(1);

      await service.findAll({ maxBudget: 2000 });
      expect(prisma.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ budget: expect.objectContaining({ lte: 2000 }) }),
        }),
      );
    });

    it('applies both minBudget and maxBudget together', async () => {
      const { prisma, service } = setup();
      prisma.job.findMany.mockResolvedValue([baseJob]);
      prisma.job.count = jest.fn().mockResolvedValue(1);

      await service.findAll({ minBudget: 100, maxBudget: 5000 });
      expect(prisma.job.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            budget: expect.objectContaining({ gte: 100, lte: 5000 }),
          }),
        }),
      );
    });

    it('caps page size at MAX_PAGE_SIZE (100)', async () => {
      const { prisma, service } = setup();
      prisma.job.findMany.mockResolvedValue([]);
      prisma.job.count = jest.fn().mockResolvedValue(0);

      const result = await service.findAll(undefined, { page: 1, limit: 9999 });
      expect(result.limit).toBe(100);
    });

    it('defaults to page 1 when page < 1', async () => {
      const { prisma, service } = setup();
      prisma.job.findMany.mockResolvedValue([]);
      prisma.job.count = jest.fn().mockResolvedValue(0);

      const result = await service.findAll(undefined, { page: 0 });
      expect(result.page).toBe(1);
    });
  });

  describe('create', () => {
    it('creates a job with OPEN status', async () => {
      const { prisma, service } = setup();
      prisma.job.create.mockResolvedValue(baseJob);

      const result = await service.create(CLIENT_ID, {
        title: 'Build Soroban escrow',
        description: 'Need a Rust dev',
        budget: 1200,
        category: 'Smart Contracts',
      });

      expect(prisma.job.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: JobStatus.OPEN,
            clientId: CLIENT_ID,
          }),
        }),
      );
      expect(result.status).toBe(JobStatus.OPEN);
    });
  });

  describe('findOne', () => {
    it('returns the job when found', async () => {
      const { prisma, service } = setup();
      prisma.job.findUnique.mockResolvedValue(baseJob);
      const result = await service.findOne(JOB_ID);
      expect(result.id).toBe(JOB_ID);
    });

    it('throws NotFoundException when job does not exist', async () => {
      const { prisma, service } = setup();
      prisma.job.findUnique.mockResolvedValue(null);
      await expect(service.findOne('nonexistent')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('updates job when caller is owner', async () => {
      const { prisma, service } = setup();
      prisma.job.findUnique.mockResolvedValue(baseJob);
      prisma.job.update.mockResolvedValue({ ...baseJob, title: 'Updated' });

      const result = await service.update(JOB_ID, CLIENT_ID, UserRole.CLIENT, {
        title: 'Updated',
      });
      expect(result.title).toBe('Updated');
    });

    it('throws ForbiddenException when caller is not owner', async () => {
      const { prisma, service } = setup();
      prisma.job.findUnique.mockResolvedValue(baseJob);

      await expect(
        service.update(JOB_ID, 'other-user', UserRole.FREELANCER, {
          title: 'X',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws BadRequestException when job is not OPEN', async () => {
      const { prisma, service } = setup();
      prisma.job.findUnique.mockResolvedValue({
        ...baseJob,
        status: JobStatus.IN_PROGRESS,
      });

      await expect(
        service.update(JOB_ID, CLIENT_ID, UserRole.CLIENT, { title: 'X' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('cancel', () => {
    it('cancels an OPEN job', async () => {
      const { prisma, service } = setup();
      prisma.job.findUnique.mockResolvedValue(baseJob);
      prisma.job.update.mockResolvedValue({
        ...baseJob,
        status: JobStatus.CANCELLED,
      });

      const result = await service.cancel(JOB_ID, CLIENT_ID, UserRole.CLIENT);
      expect(result.status).toBe(JobStatus.CANCELLED);
    });

    it('throws BadRequestException when job has a contract', async () => {
      const { prisma, service } = setup();
      prisma.job.findUnique.mockResolvedValue({
        ...baseJob,
        contract: { id: 'contract-001', status: 'ACTIVE' },
      });

      await expect(
        service.cancel(JOB_ID, CLIENT_ID, UserRole.CLIENT),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
