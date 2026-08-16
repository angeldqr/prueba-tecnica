import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { CORRELATION_HEADER, newCorrelationId, runWithContext, sanitizeCorrelationId } from './correlation';

/**
 * Abre el AsyncLocalStorage de la petición. A partir de aquí cualquier capa —caso de
 * uso, repositorio o el productor que encola el job— puede leer el correlationId sin
 * que haya que ir pasándolo por parámetro.
 *
 * `req.id` lo pone pino-http con lo que devuelve genReqId, que corre antes que este
 * middleware. Se reutiliza para que el identificador del log y el del contexto sean
 * el mismo.
 */
@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const correlationId =
      sanitizeCorrelationId(req.headers[CORRELATION_HEADER]) ??
      sanitizeCorrelationId(req.id) ??
      newCorrelationId();

    if (!res.getHeader(CORRELATION_HEADER)) {
      res.setHeader(CORRELATION_HEADER, correlationId);
    }

    runWithContext({ correlationId, source: 'http' }, next);
  }
}
