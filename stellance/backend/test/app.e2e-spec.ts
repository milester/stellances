import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as http from 'http';
import request from 'supertest';
import { AppModule } from './../src/app.module';

/**
 * E2E smoke tests.
 *
 * These tests require a running PostgreSQL instance pointed to by DATABASE_URL.
 * In CI the database is not available, so these tests are skipped unless
 * DATABASE_URL is set and does not contain the placeholder value.
 */
const SKIP_E2E =
  !process.env.DATABASE_URL || process.env.DATABASE_URL.includes('placeholder');

(SKIP_E2E ? describe.skip : describe)('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api returns 200', () => {
    return request(app.getHttpServer() as http.Server).get('/api').expect(200);
  });

  it('POST /api/auth/register with invalid body returns 400', () => {
    return request(app.getHttpServer() as http.Server)
      .post('/api/auth/register')
      .send({ email: 'not-an-email' })
      .expect(400);
  });

  it('POST /api/auth/login with wrong credentials returns 401', () => {
    return request(app.getHttpServer() as http.Server)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrong' })
      .expect(401);
  });
});
