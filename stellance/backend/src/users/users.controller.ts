import {
  Controller,
  Get,
  Patch,
  Body,
  Req,
  UnauthorizedException,
  ForbiddenException,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import type { Request } from 'express';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import type { User } from '../generated/prisma/client';
import { UserRole } from '../generated/prisma/client';

interface AuthRequest extends Request {
  user?: { id?: string; role?: UserRole };
}

export type UserProfile = Omit<User, 'password'>;

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({ summary: 'Get the authenticated user profile' })
  @Get('me')
  async me(@Req() req: AuthRequest): Promise<UserProfile> {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();

    const user = await this.usersService.findOneById(userId);
    if (!user) throw new UnauthorizedException();

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...profile } = user;
    return profile;
  }

  @ApiOperation({
    summary:
      'Update profile — set name and/or Stellar public key for Freighter signing',
  })
  @Patch('me')
  async updateMe(
    @Req() req: AuthRequest,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserProfile> {
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();

    const user = await this.usersService.updateProfile(userId, dto);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...profile } = user;
    return profile;
  }

  @ApiOperation({ summary: 'List all users — admin only' })
  @ApiQuery({
    name: 'page',
    type: Number,
    required: false,
    description: '1-based page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    type: Number,
    required: false,
    description: 'Items per page (default: 20, max: 100)',
  })
  @Get()
  async findAll(
    @Req() req: AuthRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    if (req.user?.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin access required');
    }
    return this.usersService.findAll({
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
