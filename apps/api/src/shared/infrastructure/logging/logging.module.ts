import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { LoggerModule } from 'nestjs-pino';
import { TypedConfigService } from '../config';
import { AppConfigModule } from '../config/config.module';
import { CORRELATION_HEADER, currentContext, newCorrelationId, sanitizeCorrelationId } from './correlation';
import { CorrelationMiddleware } from './correlation.middleware';
import { REDACTED_PATHS, REDACTION_PLACEHOLDER } from './redaction';

/** Sondas de Kubernetes: se atienden muchas veces por minuto y no aportan nada al log. */
const SILENT_ROUTES = new Set(['/health/live', '/health/ready', '/metrics']);

/** Express monta el middleware bajo un patrón y le recorta el prefijo a `req.url`,
 *  que dentro vale `/`. La ruta que pidió el cliente está en `originalUrl`. */
function requestPath(req: IncomingMessage & { originalUrl?: string }): string {
  const url = req.originalUrl ?? req.url ?? '';
  const queryStart = url.indexOf('?');

  return queryStart === -1 ? url : url.slice(0, queryStart);
}

@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [TypedConfigService],
      useFactory: (config: TypedConfigService) => ({
        // Por defecto nestjs-pino se registra con '*', que Express 5 ya no admite y
        // Nest convierte soltando un aviso en cada arranque.
        forRoutes: ['{*path}'],
        pinoHttp: {
          level: config.get('LOG_LEVEL'),

          redact: {
            paths: [...REDACTED_PATHS],
            censor: REDACTION_PLACEHOLDER,
          },

          genReqId: (req: IncomingMessage, res: ServerResponse) => {
            const id = sanitizeCorrelationId(req.headers[CORRELATION_HEADER]) ?? newCorrelationId();
            res.setHeader(CORRELATION_HEADER, id);
            return id;
          },

          // Fuera de una petición HTTP —dentro de un worker— el contexto lo abre
          // quien consume el job, y esto lo arrastra igualmente a cada línea.
          mixin: () => {
            const context = currentContext();
            if (!context) return {};

            return {
              correlationId: context.correlationId,
              source: context.source,
              ...(context.userId ? { userId: context.userId } : {}),
            };
          },

          autoLogging: {
            ignore: (req: IncomingMessage) => SILENT_ROUTES.has(requestPath(req)),
          },

          serializers: {
            req: (req: { id: string; method: string; url: string; originalUrl?: string }) => ({
              id: req.id,
              method: req.method,
              url: req.originalUrl ?? req.url,
            }),
            res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
          },

          transport: config.isProduction
            ? undefined
            : {
                target: 'pino-pretty',
                options: { singleLine: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' },
              },
        },
      }),
    }),
  ],
})
export class LoggingModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Sintaxis de comodín de Express 5: el '*' suelto ya no vale como patrón.
    consumer.apply(CorrelationMiddleware).forRoutes('{*path}');
  }
}
