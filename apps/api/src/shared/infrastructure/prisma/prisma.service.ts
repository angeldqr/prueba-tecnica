import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PrismaClient } from '../../../generated/prisma/client';
import type { Prisma } from '../../../generated/prisma/client';
import { TypedConfigService } from '../config';

/**
 * Los avisos y errores salen como eventos en vez de por stdout, para que acaben en
 * el log estructurado de Pino con su correlationId como todo lo demás. El tipo se
 * pasa como parámetro genérico porque de él depende la firma de `$on`.
 */
const LOG_EVENTS = [
  { emit: 'event', level: 'warn' },
  { emit: 'event', level: 'error' },
] satisfies Prisma.LogDefinition[];

type ClientOptions = { adapter: PrismaPg; log: typeof LOG_EVENTS };

@Injectable()
export class PrismaService extends PrismaClient<ClientOptions> implements OnModuleInit, OnModuleDestroy {
  constructor(
    config: TypedConfigService,
    @InjectPinoLogger(PrismaService.name)
    private readonly logger: PinoLogger,
  ) {
    // Prisma 7 va sin motor propio: la conexión la abre el driver de node-postgres.
    // El relay del outbox necesita además una conexión suya para el LISTEN, que se
    // saca del mismo pool.
    super({
      adapter: new PrismaPg({ connectionString: config.get('DATABASE_URL') }),
      log: LOG_EVENTS,
    });
  }

  async onModuleInit(): Promise<void> {
    this.$on('warn', (event) => this.logger.warn({ target: event.target }, event.message));
    this.$on('error', (event) => this.logger.error({ target: event.target }, event.message));

    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** Sonda de readiness. Un SELECT trivial basta para saber si el pool responde. */
  async isReachable(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.warn({ err: error }, 'Postgres no responde');
      return false;
    }
  }
}
