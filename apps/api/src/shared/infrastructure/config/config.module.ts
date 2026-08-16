import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { envFileCandidates } from './env-files';
import { validateEnv } from './env.schema';
import { TypedConfigService } from './typed-config.service';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // El .env vive en la raíz del monorepo: una sola copia para la API, los
      // workers y el frontend. En un contenedor no habrá ninguno y la
      // configuración llega por variables de entorno.
      envFilePath: envFileCandidates(),
      validate: validateEnv,
    }),
  ],
  providers: [TypedConfigService],
  exports: [TypedConfigService],
})
export class AppConfigModule {}
