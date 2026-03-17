import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { User } from '../generated/prisma/client';
import { UserRole } from '../generated/prisma/client';

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
}
