import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { customValidationPipe } from './pipes/custom-validation.pipe.js';
import { AllExceptionsFilter } from './common/filters/http-exception.filter.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(
    helmet({
      // JSON API with one HTML exception (Swagger UI at /docs, which needs
      // inline scripts/styles to render) — a global 'none' CSP would break it.
      contentSecurityPolicy: {
        directives: { ...helmet.contentSecurityPolicy.getDefaultDirectives(), 'default-src': ["'self'"] },
      },
      // Only meaningful behind TLS; forcing it in dev would push plain-HTTP
      // localhost into HTTPS-only via the browser's HSTS cache.
      hsts: process.env.NODE_ENV === 'production',
    }),
  );
  app.enableCors({ origin: process.env.FRONTEND_URL ?? 'http://localhost:3010', credentials: true });
  app.use(cookieParser());
  app.useGlobalPipes(customValidationPipe);
  app.useGlobalFilters(new AllExceptionsFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Mario da Parfums API')
    .setDescription('Backend API for Mario da Parfums')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
