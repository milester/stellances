import {
  Injectable,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import * as argon2 from 'argon2';
import { UserRole } from '../generated/prisma/client';
import { RegisterDto } from './dto/register.dto';
import crypto from 'node:crypto';
import type { StringValue } from 'ms';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private prisma: PrismaService,
  ) {}

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.usersService.findOneByEmail(email);
    if (user && (await argon2.verify(user.password, pass))) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  private getAccessTokenExpiresIn(): StringValue {
    const raw = this.configService.get<string>('JWT_ACCESS_EXPIRES_IN');
    if (raw && /^\d+(ms|s|m|h|d|w|y)$/.test(raw)) {
      return raw as StringValue;
    }
    return '15m';
  }

  private getRefreshTokenDays(): number {
    const raw = this.configService.get<string>('JWT_REFRESH_DAYS');
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
  }

  private hashRefreshToken(token: string): string {
    const pepper = this.configService.get<string>('REFRESH_TOKEN_PEPPER') || '';
    return crypto
      .createHash('sha256')
      .update(`${token}.${pepper}`)
      .digest('hex');
  }

  private generateRefreshToken(): string {
    return crypto.randomBytes(48).toString('base64url');
  }

  async login(user: any, meta?: { ip?: string; userAgent?: string }) {
    const payload = {
      email: user.email,
      sub: user.id,
      role: user.role,
      tv: user.tokenVersion,
      typ: 'access',
    };
    const access_token = this.jwtService.sign(payload, {
      expiresIn: this.getAccessTokenExpiresIn(),
    });

    const refresh_token = this.generateRefreshToken();
    const refreshTokenHash = this.hashRefreshToken(refresh_token);
    const expiresAt = new Date(
      Date.now() + this.getRefreshTokenDays() * 24 * 60 * 60 * 1000,
    );

    await this.prisma.refreshToken.create({
      data: {
        token: refreshTokenHash,
        userId: user.id,
        tokenVersion: user.tokenVersion ?? 0,
        expiresAt,
        ip: meta?.ip,
        userAgent: meta?.userAgent,
      },
    });

    return {
      access_token,
      refresh_token,
    };
  }

  async refresh(
    refreshToken: string,
    meta?: { ip?: string; userAgent?: string },
  ) {
    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }

    const tokenHash = this.hashRefreshToken(refreshToken);
    const existing = await this.prisma.refreshToken.findUnique({
      where: { token: tokenHash },
      include: { user: true },
    });

    if (!existing) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (existing.revoked) {
      if (existing.replacedByTokenId) {
        await this.logoutAll(existing.userId);
        throw new ForbiddenException('Refresh token reuse detected');
      }
      throw new UnauthorizedException('Refresh token revoked');
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    if (existing.user.tokenVersion !== existing.tokenVersion) {
      throw new UnauthorizedException('Refresh token invalid');
    }

    const newRefreshToken = this.generateRefreshToken();
    const newRefreshTokenHash = this.hashRefreshToken(newRefreshToken);
    const newExpiresAt = new Date(
      Date.now() + this.getRefreshTokenDays() * 24 * 60 * 60 * 1000,
    );

    try {
      await this.prisma.$transaction(async (tx) => {
        const rotated = await tx.refreshToken.create({
          data: {
            token: newRefreshTokenHash,
            userId: existing.userId,
            tokenVersion: existing.user.tokenVersion,
            expiresAt: newExpiresAt,
            ip: meta?.ip,
            userAgent: meta?.userAgent,
          },
        });

        const revoked = await tx.refreshToken.updateMany({
          where: { id: existing.id, revoked: false },
          data: {
            revoked: true,
            revokedAt: new Date(),
            replacedByTokenId: rotated.id,
          },
        });

        if (revoked.count !== 1) {
          throw new ForbiddenException('Refresh token reuse detected');
        }
      });
    } catch (err) {
      if (err instanceof ForbiddenException) {
        await this.logoutAll(existing.userId);
      }
      throw err;
    }

    const accessPayload = {
      email: existing.user.email,
      sub: existing.user.id,
      role: existing.user.role,
      tv: existing.user.tokenVersion,
      typ: 'access',
    };
    const access_token = this.jwtService.sign(accessPayload, {
      expiresIn: this.getAccessTokenExpiresIn(),
    });

    return {
      access_token,
      refresh_token: newRefreshToken,
    };
  }

  async revokeRefreshToken(refreshToken: string) {
    if (!refreshToken) return;

    const tokenHash = this.hashRefreshToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: {
        token: tokenHash,
        revoked: false,
      },
      data: {
        revoked: true,
        revokedAt: new Date(),
      },
    });
  }

  async logoutAll(userId: string) {
    const now = new Date();
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
    await this.prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true, revokedAt: now },
    });
  }

  async register(registerDto: RegisterDto, meta?: { ip?: string; userAgent?: string }) {
    const existingUser = await this.usersService.findOneByEmail(
      registerDto.email,
    );
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const passwordHash = await argon2.hash(registerDto.password);

    const user = await this.usersService.create({
      email: registerDto.email,
      name: registerDto.name,
      passwordHash,
      role: registerDto.role ?? UserRole.CLIENT,
    });

    const { password, ...result } = user;
    const { access_token, refresh_token } = await this.login(user, meta);
    return { user: result, access_token, refresh_token };
  }
}
