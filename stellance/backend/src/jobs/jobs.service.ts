import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JobStatus, UserRole, Prisma } from '../generated/prisma/client';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';

/** Maximum number of jobs returned per page. */
const MAX_PAGE_SIZE = 100;
/** Default number of jobs returned per page. */
const DEFAULT_PAGE_SIZE = 20;

export interface JobFilters {
  /** Filter by job status (defaults to OPEN for the public marketplace). */
  status?: JobStatus;
  /** Filter to jobs owned by this clientId. */
  clientId?: string;
  /**
   * Free-text search against title and category.
   * Uses Prisma `contains` with `insensitive` mode (case-insensitive).
   * Full-text search can be added in a later migration when the dataset grows.
   */
  search?: string;
  /** Minimum budget filter (inclusive). */
  minBudget?: number;
  /** Maximum budget filter (inclusive). */
  maxBudget?: number;
}

export interface PaginationParams {
  /** 1-based page number (defaults to 1). */
  page?: number;
  /** Number of items per page (defaults to 20, max 100). */
  limit?: number;
}

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(clientId: string, dto: CreateJobDto) {
    return this.prisma.job.create({
      data: {
        title: dto.title,
        description: dto.description,
        budget: dto.budget,
        category: dto.category,
        status: JobStatus.OPEN,
        clientId,
      },
    });
  }

  /**
   * Find jobs with optional filtering and cursor-compatible pagination.
   *
   * Returns `{ data, total, page, limit, totalPages }` so the frontend can
   * render pagination controls without a separate count request.
   */
  async findAll(filters?: JobFilters, pagination?: PaginationParams) {
    const page = Math.max(1, pagination?.page ?? 1);
    const limit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, pagination?.limit ?? DEFAULT_PAGE_SIZE),
    );
    const skip = (page - 1) * limit;

    // Build where clause — Prisma.JobWhereInput gives the correct type and
    // avoids the @typescript-eslint/no-unsafe-assignment that fires when using
    // Parameters<typeof prisma.job.findMany>[0]['where'].
    const where: Prisma.JobWhereInput = {
      ...(filters?.status !== undefined && { status: filters.status }),
      ...(filters?.clientId !== undefined && { clientId: filters.clientId }),
      ...(filters?.search
        ? {
            OR: [
              {
                title: {
                  contains: filters.search,
                  mode: 'insensitive' as const,
                },
              },
              {
                category: {
                  contains: filters.search,
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
      ...(filters?.minBudget !== undefined || filters?.maxBudget !== undefined
        ? {
            budget: {
              ...(filters.minBudget !== undefined && {
                gte: filters.minBudget,
              }),
              ...(filters.maxBudget !== undefined && {
                lte: filters.maxBudget,
              }),
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.job.findMany({
        where,
        include: {
          client: {
            select: { id: true, name: true, stellarPublicKey: true },
          },
          contract: { select: { id: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.job.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const job = await this.prisma.job.findUnique({
      where: { id },
      include: {
        client: {
          select: { id: true, name: true, stellarPublicKey: true },
        },
        contract: {
          select: { id: true, status: true, freelancerId: true },
        },
      },
    });
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    return job;
  }

  async update(
    id: string,
    callerId: string,
    callerRole: UserRole,
    dto: UpdateJobDto,
  ) {
    const job = await this.findOne(id);

    if (job.clientId !== callerId && callerRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Only the job owner can update this job');
    }
    if (job.status !== JobStatus.OPEN) {
      throw new BadRequestException('Only OPEN jobs can be updated');
    }

    return this.prisma.job.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.budget !== undefined && { budget: dto.budget }),
        ...(dto.category !== undefined && { category: dto.category }),
      },
    });
  }

  async cancel(id: string, callerId: string, callerRole: UserRole) {
    const job = await this.findOne(id);

    if (job.clientId !== callerId && callerRole !== UserRole.ADMIN) {
      throw new ForbiddenException('Only the job owner can cancel this job');
    }
    if (
      job.status === JobStatus.COMPLETED ||
      job.status === JobStatus.CANCELLED
    ) {
      throw new BadRequestException(`Job is already ${job.status}`);
    }
    if (job.contract) {
      throw new BadRequestException(
        'Cannot cancel a job that has an active contract',
      );
    }

    return this.prisma.job.update({
      where: { id },
      data: { status: JobStatus.CANCELLED },
    });
  }
}
