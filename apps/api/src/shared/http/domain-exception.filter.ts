import { Catch, HttpException, HttpStatus, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { isDomainError, type DomainErrorCode } from '../domain/errors';
// Del fichero concreto, no del barrel: este exporta también el módulo de logging, y
// con él la llamada a ConfigModule.forRoot que valida el entorno al importarse.
import { currentCorrelationId } from '../infrastructure/logging/correlation';

const STATUS_BY_CODE: Readonly<Record<DomainErrorCode, HttpStatus>> = {
  VALIDATION_FAILED: HttpStatus.BAD_REQUEST,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  BUSINESS_RULE_VIOLATION: HttpStatus.UNPROCESSABLE_ENTITY,
  ILLEGAL_TRANSITION: HttpStatus.CONFLICT,
  DEPENDENCY_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
};

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  correlationId?: string;
  timestamp: string;
}

@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  constructor(
    @InjectPinoLogger(DomainExceptionFilter.name)
    private readonly logger: PinoLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { status, body } = this.describe(exception);

    // Al registrarse como APP_FILTER captura también lo que se lance fuera de una
    // petición HTTP. Ahí no hay respuesta que devolver, y llamar a switchToHttp
    // taparía la excepción original con un TypeError dentro del propio filtro.
    if (host.getType() !== 'http') {
      this.logger.error({ err: exception, context: host.getType() }, body.error.message);
      return;
    }

    const response = host.switchToHttp().getResponse<Response>();

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error({ err: exception }, body.error.message);
    } else {
      this.logger.warn({ code: body.error.code, status }, body.error.message);
    }

    response.status(status).json({ ...body, correlationId: currentCorrelationId() });
  }

  private describe(exception: unknown): { status: HttpStatus; body: ErrorBody } {
    const timestamp = new Date().toISOString();

    if (isDomainError(exception)) {
      return {
        status: STATUS_BY_CODE[exception.code],
        body: {
          error: {
            code: exception.code,
            message: exception.message,
            ...(Object.keys(exception.details).length > 0 ? { details: exception.details } : {}),
          },
          timestamp,
        },
      };
    }

    if (exception instanceof HttpException) {
      return {
        status: exception.getStatus(),
        body: {
          error: { code: httpErrorCode(exception.getStatus()), ...extractHttpBody(exception) },
          timestamp,
        },
      };
    }

    // Un error no previsto puede llevar dentro una ruta de fichero, una consulta SQL
    // o el propio dato que lo rompió. Al cliente le va un mensaje genérico; el
    // detalle queda en el log, localizable por correlationId.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' },
        timestamp,
      },
    };
  }
}

function httpErrorCode(status: number): string {
  const name = HttpStatus[status];
  return typeof name === 'string' ? name : 'HTTP_ERROR';
}

function extractHttpBody(exception: HttpException): {
  message: string;
  details?: Record<string, unknown>;
} {
  const payload = exception.getResponse();

  if (typeof payload === 'string') {
    return { message: payload };
  }

  // statusCode y error los repite Nest en el cuerpo; ya van en la respuesta y en
  // error.code, así que se descartan aquí.
  const { message, statusCode, error, ...rest } = payload as Record<string, unknown>;

  return {
    message: Array.isArray(message) ? message.join('; ') : String(message ?? exception.message),
    ...(Object.keys(rest).length > 0 ? { details: rest } : {}),
  };
}
