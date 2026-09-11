import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { customValidationPipe } from './pipes/custom-validation.pipe.js';
import { AllExceptionsFilter } from './common/filters/http-exception.filter.js';


async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(customValidationPipe);
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
