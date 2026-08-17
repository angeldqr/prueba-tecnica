import { DependencyUnavailableError } from '../../../shared/domain';

/**
 * Todo fallo de un proveedor sale como una indisponibilidad de dependencia —al
 * cliente le da igual de quién es la culpa—, pero por dentro se distingue lo que
 * tiene sentido reintentar de lo que no. Reintentar un 400 solo gasta cuota.
 */
export abstract class BankProviderError extends DependencyUnavailableError {
  abstract readonly retryable: boolean;

  protected constructor(
    readonly provider: string,
    reason: string,
  ) {
    super(provider, reason);
  }
}

/** El proveedor no contestó a tiempo. Puede que la siguiente vez sí. */
export class ProviderTimeoutError extends BankProviderError {
  readonly retryable = true;

  constructor(provider: string, timeoutMs: number) {
    super(provider, `no respondió en ${timeoutMs} ms`);
  }
}

/** 5xx o error de red: el problema está del otro lado y suele ser pasajero. */
export class ProviderUnavailableError extends BankProviderError {
  readonly retryable = true;

  constructor(provider: string, reason: string) {
    super(provider, reason);
  }
}

/** 4xx: la petición no le gusta y no le va a gustar más por repetirla. */
export class ProviderRejectedError extends BankProviderError {
  readonly retryable = false;

  constructor(provider: string, status: number) {
    super(provider, `rechazó la consulta con un ${status}`);
  }
}

/**
 * Contestó, pero con algo que no encaja con el contrato acordado. Reintentar
 * devolvería lo mismo; esto es un aviso de que el proveedor cambió su formato.
 */
export class ProviderContractError extends BankProviderError {
  readonly retryable = false;

  constructor(provider: string, detail: string) {
    super(provider, `devolvió una respuesta que no cumple el contrato: ${detail}`);
  }
}

/** El circuito está abierto: se corta antes de salir a la red. */
export class CircuitOpenError extends BankProviderError {
  readonly retryable = false;

  constructor(provider: string, retryAtMs: number) {
    super(provider, `circuito abierto hasta ${new Date(retryAtMs).toISOString()}`);
  }
}

export function isRetryable(error: unknown): boolean {
  return error instanceof BankProviderError && error.retryable;
}
