import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service';
import { Public } from './auth/decorators/public.decorator';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /**
   * GET /api/health
   *
   * Public liveness probe used by load balancers, Docker health checks,
   * and CI smoke tests. Returns a 200 with the running network and version.
   *
   * This endpoint is excluded from JWT auth via the @Public() decorator.
   */
  @Public()
  @ApiOperation({
    summary: 'Health check — liveness probe (no auth required)',
  })
  @Get('health')
  health(): { status: string; version: string; network: string; timestamp: string } {
    return this.appService.health();
  }
}
