import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { JobsService } from './jobs.service';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { JobStatus, UserRole } from '../generated/prisma/client';

interface AuthRequest extends Request {
  user: { id: string; role: UserRole };
}

@ApiTags('jobs')
@ApiBearerAuth()
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @ApiOperation({ summary: 'Post a new job (CLIENT only)' })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Req() req: AuthRequest, @Body() dto: CreateJobDto) {
    return this.jobsService.create(req.user.id, dto);
  }

  @ApiOperation({ summary: 'List jobs with optional filters and pagination' })
  @ApiQuery({ name: 'status', enum: JobStatus, required: false })
  @ApiQuery({ name: 'mine', type: Boolean, required: false })
  @ApiQuery({
    name: 'search',
    type: String,
    required: false,
    description: 'Case-insensitive search in title and category',
  })
  @ApiQuery({
    name: 'minBudget',
    type: Number,
    required: false,
    description: 'Minimum budget (XLM)',
  })
  @ApiQuery({
    name: 'maxBudget',
    type: Number,
    required: false,
    description: 'Maximum budget (XLM)',
  })
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
  findAll(
    @Req() req: AuthRequest,
    @Query('status') status?: JobStatus,
    @Query('mine') mine?: string,
    @Query('search') search?: string,
    @Query('minBudget') minBudget?: string,
    @Query('maxBudget') maxBudget?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const clientId = mine === 'true' ? req.user.id : undefined;
    return this.jobsService.findAll(
      {
        status,
        clientId,
        search: search?.trim() || undefined,
        minBudget: minBudget ? parseFloat(minBudget) : undefined,
        maxBudget: maxBudget ? parseFloat(maxBudget) : undefined,
      },
      {
        page: page ? parseInt(page, 10) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
      },
    );
  }

  @ApiOperation({ summary: 'Get a single job by id' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.jobsService.findOne(id);
  }

  @ApiOperation({ summary: 'Update a job (owner / admin)' })
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Req() req: AuthRequest,
    @Body() dto: UpdateJobDto,
  ) {
    return this.jobsService.update(id, req.user.id, req.user.role, dto);
  }

  @ApiOperation({ summary: 'Cancel a job (owner / admin)' })
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id') id: string, @Req() req: AuthRequest) {
    return this.jobsService.cancel(id, req.user.id, req.user.role);
  }
}
