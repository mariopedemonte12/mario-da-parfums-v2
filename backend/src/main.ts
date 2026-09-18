import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { customValidationPipe } from './pipes/custom-validation.pipe.js';
import { AllExceptionsFilter } from './common/filters/http-exception.filter.js';

// Explicit, intentional cap in place of body-parser's accidental 100kb
// default. Sized against the largest legitimate payload today: a 100-item
// batch (the @ArrayMaxSize cap on listings/vendors batch DTOs) of
// CreateListingDto at its longest fields (500-char url) is ~70KB — 256kb
// leaves headroom for that plus JSON escaping/multi-byte content without
// opening the door to multi-MB bodies.
const BODY_SIZE_LIMIT = '256kb';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  // helmet first: if json()/urlencoded() below reject an oversized body,
  // Express routes that error straight to the exception filter, skipping
  // any later regular middleware — helmet must already have run so its
  // headers (X-Powered-By removal included) still apply to that response.
  app.use(
    helmet({
      // JSON API with one HTML exception (Swagger UI at /docs, which needs
      // inline scripts/styles to render) — a global 'none' CSP would break it.
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          'default-src': ["'self'"],
        },
      },
      // Only meaningful behind TLS; forcing it in dev would push plain-HTTP
      // localhost into HTTPS-only via the browser's HSTS cache.
      hsts: process.env.NODE_ENV === 'production',
    }),
  );
  app.use(json({ limit: BODY_SIZE_LIMIT }));
  app.use(urlencoded({ limit: BODY_SIZE_LIMIT, extended: true }));
  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3010',
    credentials: true,
  });
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
