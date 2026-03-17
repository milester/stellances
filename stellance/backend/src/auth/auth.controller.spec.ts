import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

class ResponseMock {
  cookies: Array<{ name: string; value: string; options: any }> = [];
  cleared: Array<{ name: string; options: any }> = [];

  cookie(name: string, value: string, options: any) {
    this.cookies.push({ name, value, options });
    return this;
  }

  clearCookie(name: string, options: any) {
    this.cleared.push({ name, options });
    return this;
  }
}

describe('AuthController', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_REFRESH_DAYS = '30';
  });

  it('login() sets access_token + refresh_token cookies', async () => {
    const authService = {
      login: jest.fn().mockResolvedValue({
        access_token: 'access',
        refresh_token: 'refresh',
      }),
    } as unknown as AuthService;

    const controller = new AuthController(authService);
    const res = new ResponseMock();
    const req = {
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest' },
      user: { id: 'u1' },
    };

    const body = await controller.login(req as any, res as any);

    expect(body.access_token).toBe('access');
    expect(res.cookies.find((c) => c.name === 'refresh_token')?.options).toMatchObject({
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    expect(authService.login).toHaveBeenCalled();
  });

  it('register() returns access token and sets refresh_token cookie', async () => {
    const authService = {
      register: jest.fn().mockResolvedValue({
        user: { id: 'u1', email: 'e', role: 'CLIENT' },
        access_token: 'access',
        refresh_token: 'refresh',
      }),
    } as unknown as AuthService;

    const controller = new AuthController(authService);
    const res = new ResponseMock();
    const req = { ip: '127.0.0.1', headers: { 'user-agent': 'jest' } };

    const body = await controller.register({ email: 'e', password: 'p', name: 'n' } as any, req as any, res as any);

    expect(body.access_token).toBe('access');
    expect(res.cookies.find((c) => c.name === 'refresh_token')?.value).toBe('refresh');
    expect(authService.register).toHaveBeenCalled();
  });

  it('refresh() uses refresh_token cookie and sets rotated cookies', async () => {
    const authService = {
      refresh: jest.fn().mockResolvedValue({
        access_token: 'access2',
        refresh_token: 'refresh2',
      }),
    } as unknown as AuthService;

    const controller = new AuthController(authService);
    const res = new ResponseMock();
    const req = {
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest' },
      cookies: { refresh_token: 'refresh1' },
    };

    const body = await controller.refresh(req as any, res as any);

    expect(body.access_token).toBe('access2');
    expect(authService.refresh).toHaveBeenCalledWith('refresh1', expect.any(Object));
    expect(res.cookies.some((c) => c.name === 'refresh_token' && c.value === 'refresh2')).toBe(true);
  });

  it('logout() revokes refresh token and clears cookies', async () => {
    const authService = {
      revokeRefreshToken: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthService;

    const controller = new AuthController(authService);
    const res = new ResponseMock();
    const req = { cookies: { refresh_token: 'refresh1' } };

    const body = await controller.logout(req as any, res as any);

    expect(body.message).toContain('Logged out');
    expect(authService.revokeRefreshToken).toHaveBeenCalledWith('refresh1');
    expect(res.cleared.some((c) => c.name === 'access_token')).toBe(true);
    expect(res.cleared.some((c) => c.name === 'refresh_token')).toBe(true);
  });

  it('logoutAll() revokes all refresh tokens and clears cookies', async () => {
    const authService = {
      logoutAll: jest.fn().mockResolvedValue(undefined),
    } as unknown as AuthService;

    const controller = new AuthController(authService);
    const res = new ResponseMock();
    const req = { user: { id: 'u1' } };

    const body = await controller.logoutAll(req as any, res as any);

    expect(body.message).toContain('everywhere');
    expect(authService.logoutAll).toHaveBeenCalledWith('u1');
    expect(res.cleared.some((c) => c.name === 'access_token')).toBe(true);
    expect(res.cleared.some((c) => c.name === 'refresh_token')).toBe(true);
  });
});
