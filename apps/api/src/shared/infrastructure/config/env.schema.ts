import { z } from 'zod';

const port = z.coerce.number().int().min(1).max(65_535);

/** 32 bytes en hexadecimal: el tamaño de clave que pide AES-256 y el mínimo sensato para HMAC. */
const key256 = z
  .string()
  .regex(/^[0-9a-f]{64}$/i, 'se esperan 32 bytes en hexadecimal (openssl rand -hex 32)');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: port.default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  /** Lista separada por comas; se parte en cors.origin. */
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  PII_ENCRYPTION_KEY: key256,
  DOCUMENT_HASH_PEPPER: key256,

  WEBHOOK_SIGNING_SECRET: z.string().min(32),
  WEBHOOK_TOLERANCE_SECONDS: z.coerce.number().int().positive().default(300),

  BANK_PROVIDER_BASE_URL: z.string().url(),
  BANK_PROVIDER_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
  BANK_PROVIDER_LATENCY_MS: z.coerce.number().int().nonnegative().default(0),
  BANK_PROVIDER_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0),

  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(4),
  OUTBOX_BATCH_SIZE: z.coerce.number().int().positive().default(100),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5_000),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Se pasa a ConfigModule como `validate`. Falla el arranque antes de aceptar tráfico
 * en vez de reventar en la primera petición que toque la variable ausente.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(`Configuración inválida:\n${detail}`);
  }

  return result.data;
}
