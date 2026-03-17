import { Controller, Post, Body, UseGuards, Res, Req, HttpCode, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { RegisterDto } from './dto/register.dto';
import { Public } from './decorators/public.decorator';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  private isProduction() {
    return process.env.NODE_ENV === 'production';
  }

  private getRefreshDays(): number {
    const raw = process.env.JWT_REFRESH_DAYS;
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
  }

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() registerDto: RegisterDto,
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, access_token, refresh_token } = await this.authService.register(registerDto, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.cookie('refresh_token', refresh_token, {
      httpOnly: true,
      secure: this.isProduction(),
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: this.getRefreshDays() * 24 * 60 * 60 * 1000,
    });

    return { message: 'Registered successfully', access_token, user };
  }

  @Public()
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    const { access_token, refresh_token } = await this.authService.login(req.user, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  
    res.cookie('refresh_token', refresh_token, {
      httpOnly: true,
      secure: this.isProduction(),
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: this.getRefreshDays() * 24 * 60 * 60 * 1000,
    });

    return { message: 'Logged in successfully', access_token, user: req.user };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    const { access_token, refresh_token } = await this.authService.refresh(
      req.cookies?.['refresh_token'],
      {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      },
    );

   
    res.cookie('refresh_token', refresh_token, {
      httpOnly: true,
      secure: this.isProduction(),
      sameSite: 'strict',
      path: '/api/auth',
      maxAge: this.getRefreshDays() * 24 * 60 * 60 * 1000,
    });

    return { access_token };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    await this.authService.revokeRefreshToken(req.cookies?.['refresh_token']);

    res.clearCookie('access_token', {
      httpOnly: true,
      secure: this.isProduction(),
      sameSite: 'strict',
      path: '/',
    });
    res.clearCookie('refresh_token', {
      httpOnly: true,
      secure: this.isProduction(),
      sameSite: 'strict',
      path: '/api/auth',
    });
    return { message: 'Logged out successfully' };
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAll(@Req() req: any, @Res({ passthrough: true }) res: Response) {
    await this.authService.logoutAll(req.user.id);

    res.clearCookie('access_token', {
      httpOnly: true,
      secure: this.isProduction(),
      sameSite: 'strict',
      path: '/',
    });
    res.clearCookie('refresh_token', {
      httpOnly: true,
      secure: this.isProduction(),
      sameSite: 'strict',
      path: '/api/auth',
    });

    return { message: 'Logged out everywhere' };
  }
}
