import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AppService {
  constructor(private readonly config: ConfigService) {}

  /**
   * Return a structured health payload for the liveness probe.
   * Consumers (load balancers, CI, Uptime Robot) should check for HTTP 200
   * and optionally assert `status === "ok"`.
   */
  health(): { status: string; version: string; network: string; timestamp: string } {
    const network =
      this.config.get<string>('STELLAR_NETWORK') ?? 'testnet';
    return {
      status: 'ok',
      version: '0.4.0',
      network,
      timestamp: new Date().toISOString(),
    };
  }
}
