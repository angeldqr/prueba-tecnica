import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'prisma/config';
import { envFileCandidates } from './src/shared/infrastructure/config/env-files';

// El .env está en la raíz del monorepo y la CLI de Prisma corre con el cwd en
// apps/api. Se reutiliza la misma búsqueda que hace la aplicación para que las
// migraciones apunten siempre a la base que usa la API.
for (const path of envFileCandidates(__dirname)) {
  loadEnv({ path, quiet: true });
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
