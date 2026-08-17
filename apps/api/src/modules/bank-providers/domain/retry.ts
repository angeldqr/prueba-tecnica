export interface RetryOptions {
  /** Intentos totales, incluido el primero. */
  readonly attempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly isRetryable: (error: unknown) => boolean;
  /** Se avisa antes de cada reintento; sirve para registrarlo o contarlo. */
  readonly onRetry?: (attempt: number, delayMs: number, error: unknown) => void;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly random?: () => number;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Espera con *full jitter*: un valor al azar entre cero y el tope exponencial.
 *
 * El backoff exponencial pelado sincroniza a todos los clientes que fallaron a la
 * vez y los hace volver en bloque justo cuando el proveedor intenta levantarse. El
 * jitter reparte esa avalancha.
 */
export function backoffDelay(
  attempt: number,
  options: Pick<RetryOptions, 'baseDelayMs' | 'maxDelayMs'>,
  random: () => number = Math.random,
): number {
  const ceiling = Math.min(options.maxDelayMs, options.baseDelayMs * 2 ** attempt);
  return Math.round(random() * ceiling);
}

export async function withRetry<T>(operation: () => Promise<T>, options: RetryOptions): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;

  let lastError: unknown;

  for (let attempt = 0; attempt < options.attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      const isLastAttempt = attempt === options.attempts - 1;
      if (isLastAttempt || !options.isRetryable(error)) break;

      const delay = backoffDelay(attempt, options, random);
      options.onRetry?.(attempt + 1, delay, error);
      await sleep(delay);
    }
  }

  throw lastError;
}
