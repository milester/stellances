import { ForbiddenException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { PrismaServiceMock } from '../test-utils/prisma.mock';

describe('AuthService', () => {
  let authService: AuthService;
  let prisma: PrismaServiceMock;

  const testUser = {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'user@example.com',
    name: 'Test User',
    role: 'CLIENT' as const,
    password: 'hashed',
    tokenVersion: 0,
    stellarPublicKey: null,
  };

  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-secret';
    process.env.JWT_ACCESS_EXPIRES_IN = '15m';
    process.env.JWT_REFRESH_DAYS = '30';
    process.env.REFRESH_TOKEN_PEPPER = 'pepper';

    prisma = new PrismaServiceMock();
    prisma.seedUser(testUser);

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        JwtModule.register({ secret: process.env.JWT_SECRET }),
      ],
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma as unknown as PrismaService },
        { provide: UsersService, useValue: {} },
      ],
    }).compile();

    authService = moduleRef.get(AuthService);
  });

  it('login() returns access + refresh and stores hashed refresh token', async () => {
    const { access_token, refresh_token } = await authService.login(testUser);

    expect(access_token).toBeDefined();
    expect(refresh_token).toBeDefined();

    const state = prisma.getState();
    expect(state.refreshTokens).toHaveLength(1);
    expect(state.refreshTokens[0].revoked).toBe(false);
    expect(state.refreshTokens[0].token).not.toEqual(refresh_token);
  });

  it('refresh() rotates refresh token and revokes the old token', async () => {
    const { refresh_token: oldRefresh } = await authService.login(testUser);
    const rotated = await authService.refresh(oldRefresh);

    expect(rotated.access_token).toBeDefined();
    expect(rotated.refresh_token).toBeDefined();
    expect(rotated.refresh_token).not.toEqual(oldRefresh);

    const state = prisma.getState();
    expect(state.refreshTokens).toHaveLength(2);
    const old = state.refreshTokens.find((t) => t.revoked);
    const current = state.refreshTokens.find((t) => !t.revoked);
    expect(old).toBeDefined();
    expect(current).toBeDefined();
    expect(old?.replacedByTokenId).toEqual(current?.id);
  });

  it('refresh() detects reuse of rotated refresh token and triggers logoutAll (tokenVersion++)', async () => {
    const { refresh_token: oldRefresh } = await authService.login(testUser);
    await authService.refresh(oldRefresh);

    await expect(authService.refresh(oldRefresh)).rejects.toBeInstanceOf(ForbiddenException);

    const state = prisma.getState();
    const user = state.users.find((u) => u.id === testUser.id);
    expect(user?.tokenVersion).toBe(1);
    expect(state.refreshTokens.every((t) => t.revoked)).toBe(true);
  });
});

