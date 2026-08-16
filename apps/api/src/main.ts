import 'reflect-metadata';
import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { TypedConfigService } from './shared/infrastructure/config';

async function bootstrap(): Promise<void> {
  // bufferLogs retiene lo que se registre antes de que pino esté en pie, para que no
  // se pierdan los mensajes de arranque ni salgan con otro formato.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));

  const config = app.get(TypedConfigService);

  app.use(helmet());
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    exposedHeaders: ['x-correlation-id'],
  });

  app.setGlobalPrefix('api', { exclude: ['health/live', 'health/ready'] });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Da tiempo a cerrar el pool de Postgres y a devolver a la cola los jobs en vuelo
  // antes de que el pod desaparezca.
  app.enableShutdownHooks();

  await app.listen(config.get('API_PORT'));
}

void bootstrap();
