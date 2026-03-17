import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async me(@Req() req: Request & { user?: { id?: string } }) {
    const userId = req.user?.id;
    if (!userId) {
      throw new UnauthorizedException();
    }

    const user = await this.usersService.findOneById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }

    const { password, ...profile } = user;
    return profile;
  }
}
