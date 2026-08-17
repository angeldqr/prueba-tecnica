import type { CircuitBreakerOptions } from './circuit-breaker';
import type { RetryOptions } from './retry';

export const BANK_PROVIDER_POLICY = Symbol('BANK_PROVIDER_POLICY');

export interface BankProviderPolicy {
  readonly retry: Pick<RetryOptions, 'attempts' | 'baseDelayMs' | 'maxDelayMs'> &
    Partial<Pick<RetryOptions, 'sleep' | 'random'>>;
  readonly breaker: CircuitBreakerOptions;
}

/**
 * Los umbrales son cortos a propósito: la petición ya lleva su propio timeout y
 * encadenar esperas largas solo consigue que se acumulen solicitudes esperando a un
 * proveedor que ya sabemos que no responde.
 */
export const DEFAULT_PROVIDER_POLICY: BankProviderPolicy = {
  retry: {
    attempts: 3,
    baseDelayMs: 200,
    maxDelayMs: 2_000,
  },
  breaker: {
    failureThreshold: 5,
    successThreshold: 2,
    openMs: 30_000,
  },
};
