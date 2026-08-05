import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn(() => 'testnet') },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('GET /health', () => {
    it('returns status "ok"', () => {
      const result = appController.health();
      expect(result.status).toBe('ok');
    });

    it('returns a version string', () => {
      const result = appController.health();
      expect(typeof result.version).toBe('string');
      expect(result.version.length).toBeGreaterThan(0);
    });

    it('returns a network string', () => {
      const result = appController.health();
      expect(typeof result.network).toBe('string');
    });

    it('returns an ISO 8601 timestamp', () => {
      const result = appController.health();
      expect(() => new Date(result.timestamp)).not.toThrow();
      expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    });
  });
});
