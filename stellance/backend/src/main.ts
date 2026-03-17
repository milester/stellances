import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.use(cookieParser());
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: frontendUrl,
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
    .setDescription('API documentation')
    .setVersion('1.0')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  const parsedPort = process.env.PORT
    ? Number.parseInt(process.env.PORT, 10)
    : 3001;
  const port = Number.isNaN(parsedPort) ? 3001 : parsedPort;

  await app.listen(port);
  console.log("server running on port:", port)
}
bootstrap();
