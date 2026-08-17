import { Injectable } from '@nestjs/common';
import { TypedConfigService } from '../../../../shared/infrastructure/config';
import {
  CORRELATION_HEADER,
  currentCorrelationId,
} from '../../../../shared/infrastructure/logging/correlation';
import {
  ProviderContractError,
  ProviderRejectedError,
  ProviderTimeoutError,
  ProviderUnavailableError,
} from '../../domain';

/** 429 no es culpa de la petición: se ha excedido la cuota y conviene reintentar. */
const TOO_MANY_REQUESTS = 429;

@Injectable()
export class ProviderHttpClient {
  constructor(private readonly config: TypedConfigService) {}

  /**
   * Consulta a un proveedor y devuelve el JSON sin interpretar; traducirlo es cosa
   * del mapper de cada adaptador.
   *
   * Va por POST aunque semánticamente sea una consulta: el documento de identidad
   * es PII y en la query string acabaría escrito en los logs de acceso de cada salto
   * intermedio, donde ya no hay forma de borrarlo.
   */
  async post(provider: string, path: string, body: unknown): Promise<unknown> {
    const timeoutMs = this.config.get('BANK_PROVIDER_TIMEOUT_MS');
    const url = `${this.config.get('BANK_PROVIDER_BASE_URL')}${path}`;

    const correlationId = currentCorrelationId();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    // El temporizador se mantiene hasta tener el cuerpo leído, no solo hasta que
    // llegan las cabeceras: un proveedor puede contestar rápido y quedarse colgado a
    // mitad del cuerpo, y ahí el await esperaría indefinidamente pese al timeout.
    try {
      let response: Response;

      try {
        response = await fetch(url, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            // El identificador sigue vivo al otro lado: si el proveedor devuelve un
            // webhook más tarde, la traza se reconstruye entera.
            ...(correlationId ? { [CORRELATION_HEADER]: correlationId } : {}),
          },
          body: JSON.stringify(body),
        });
      } catch (error) {
        if (isAbort(error)) throw new ProviderTimeoutError(provider, timeoutMs);

        throw new ProviderUnavailableError(provider, error instanceof Error ? error.message : 'error de red');
      }

      if (!response.ok) {
        // Sin descartar el cuerpo la conexión no vuelve al pool, y bajo una caída
        // sostenida del proveedor es cuando más reintentos hay: justo el momento en
        // que peor sienta acumular sockets a medio leer.
        await discardBody(response);

        if (response.status >= 500 || response.status === TOO_MANY_REQUESTS) {
          throw new ProviderUnavailableError(provider, `respondió con un ${response.status}`);
        }

        throw new ProviderRejectedError(provider, response.status);
      }

      try {
        return await response.json();
      } catch (error) {
        if (isAbort(error)) throw new ProviderTimeoutError(provider, timeoutMs);

        throw new ProviderContractError(provider, 'el cuerpo no era JSON válido');
      }
    } finally {
      clearTimeout(timer);
    }
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

async function discardBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // Si el cuerpo ya venía cerrado no hay nada que soltar.
  }
}
