import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { RequestHandler } from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

// ---------------------------------------------------------------------------
// Startup environment validation
// ---------------------------------------------------------------------------

/**
 * Validate required environment variables at startup.
 *
 * Fail-fast if critical secrets are absent so the server never runs in a
 * misconfigured state (e.g. with a missing JWT_SECRET that would cause all
 * auth to fail silently). Non-critical vars that affect optional features
 * (Soroban integration) emit warnings instead of throwing.
 *
 * This addresses roadmap week-4 item #69: "startup env-var validation".
 */
function validateEnvironment(logger: Logger): void {
  const required: string[] = ['JWT_SECRET', 'DATABASE_URL'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    logger.error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
        `Set them in your .env file and restart.`,
    );
    process.exit(1);
  }

  // Warn about optional but important vars — these affect Soroban functionality
  // but the server can still start and serve the auth/jobs/contracts API.
  const optional: Array<{ key: string; feature: string }> = [
    { key: 'ESCROW_CONTRACT_ID', feature: 'Soroban escrow calls' },
    { key: 'STELLAR_ADMIN_SECRET', feature: 'admin-signed Soroban operations' },
  ];
  for (const { key, feature } of optional) {
    if (!process.env[key]) {
      logger.warn(
        `${key} not set — ${feature} will be unavailable until configured`,
      );
    }
  }
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Validate env before creating the NestJS app so any exit(1) happens early.
  validateEnvironment(logger);

  const app = await NestFactory.create(AppModule);

  app.use(helmet() as RequestHandler);
  app.use(cookieParser());

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Stellance API')
    .setDescription(
      'Stellar-powered freelance payment marketplace — escrow, jobs, contracts, milestones.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  const parsedPort = process.env.PORT
    ? Number.parseInt(process.env.PORT, 10)
    : 3001;
  const port = Number.isNaN(parsedPort) ? 3001 : parsedPort;

  await app.listen(port);
  logger.log(`Server running on http://localhost:${port}`);
  logger.log(`Swagger docs at http://localhost:${port}/docs`);
}
void bootstrap();
