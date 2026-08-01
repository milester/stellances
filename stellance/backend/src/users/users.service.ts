import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { User } from '../generated/prisma/client';
import { UserRole } from '../generated/prisma/client';

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findOneByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findOneById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  /**
   * List all users — admin-only endpoint.
   * Passwords are excluded from the response.
   */
  async findAll(pagination?: { page?: number; limit?: number }) {
    const page = Math.max(1, pagination?.page ?? 1);
    const limit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, pagination?.limit ?? DEFAULT_PAGE_SIZE),
    );
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          stellarPublicKey: true,
          createdAt: true,
          updatedAt: true,
          // Explicitly omit password
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.user.count(),
    ]);

    return {
      data: users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async create(data: {
    email: string;
    name: string;
    passwordHash: string;
    role: UserRole;
  }): Promise<User> {
    return this.prisma.user.create({
      data: {
        email: data.email,
        name: data.name,
        password: data.passwordHash,
        role: data.role,
      },
    });
  }

  async updateProfile(
    id: string,
    data: { name?: string; stellarPublicKey?: string },
  ): Promise<User> {
    if (data.stellarPublicKey) {
      const existing = await this.prisma.user.findUnique({
        where: { stellarPublicKey: data.stellarPublicKey },
        select: { id: true },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(
          'Stellar public key already registered to another account',
        );
      }
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.stellarPublicKey !== undefined && {
          stellarPublicKey: data.stellarPublicKey,
        }),
      },
    });
  }
}
