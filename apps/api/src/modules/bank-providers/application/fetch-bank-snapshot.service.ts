import { Inject, Injectable } from '@nestjs/common';
import type { CountryCode } from '@bravo/contracts';
import { PinoLogger } from 'nestjs-pino';
import {
  BANK_PROVIDER_POLICY,
  BANK_PROVIDER_REGISTRY,
  CircuitBreaker,
  CircuitOpenError,
  isRetryable,
  withRetry,
  type BankProviderPolicy,
  type BankProviderRegistry,
  type BankSnapshot,
  type CircuitState,
} from '../domain';

@Injectable()
export class FetchBankSnapshotService {
  /** Un circuito por país: que Serasa esté caído no debe cortar las consultas a SIBS. */
  private readonly breakers = new Map<CountryCode, CircuitBreaker>();

  constructor(
    @Inject(BANK_PROVIDER_REGISTRY)
    private readonly registry: BankProviderRegistry,
    @Inject(BANK_PROVIDER_POLICY)
    private readonly policy: BankProviderPolicy,
    // PinoLogger es de ámbito transitorio, así que cada inyección recibe el suyo y
    // setContext no pisa el de nadie. Se prefiere a @InjectPinoLogger porque aquel
    // registra el contexto en un Set que LoggerModule fotografía al construirse:
    // funciona o no según el orden en que se importen los módulos.
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(FetchBankSnapshotService.name);
  }

  /**
   * Consulta al proveedor del país, con reintentos y protegida por el circuito.
   *
   * Lo que sale de aquí lanzando es siempre un BankProviderError; el caso de uso que
   * llama decide si eso significa dejar la solicitud en BANK_DATA_UNAVAILABLE para
   * reintentarla más tarde desde la cola.
   */
  async fetch(country: CountryCode, document: string): Promise<BankSnapshot> {
    const adapter = this.registry.get(country);
    const breaker = this.breakerFor(country);

    if (!breaker.canAttempt()) {
      this.logger.warn(
        { provider: adapter.providerName, country, retryAt: breaker.retryAtMs },
        'circuito abierto: no se consulta al proveedor',
      );

      throw new CircuitOpenError(adapter.providerName, breaker.retryAtMs);
    }

    try {
      const snapshot = await withRetry(() => adapter.fetchSnapshot({ country, document }), {
        ...this.policy.retry,
        isRetryable,
        onRetry: (attempt, delayMs, error) => {
          this.logger.warn(
            {
              provider: adapter.providerName,
              country,
              attempt,
              delayMs,
              reason: error instanceof Error ? error.message : String(error),
            },
            'reintentando la consulta al proveedor',
          );
        },
      });

      breaker.recordSuccess();

      return snapshot;
    } catch (error) {
      // Un rechazo por contrato o por datos no dice nada del estado del proveedor:
      // contarlo abriría el circuito por culpa de un documento mal formado. Aun así
      // hay que avisar de que el intento terminó, o su sonda quedaría ocupada.
      if (isRetryable(error)) {
        breaker.recordFailure();
      } else {
        breaker.recordIgnored();
      }

      throw error;
    }
  }

  /**
   * Para exponer en /metrics y para poder comprobar la resiliencia desde fuera.
   *
   * No usa breakerFor a propósito: ese crea el circuito si no existe, y observar no
   * debería alterar lo observado. Un proveedor al que aún no se ha llamado se
   * informa como cerrado, que es como nacería.
   */
  circuitStates(): Record<string, CircuitState> {
    const states: Record<string, CircuitState> = {};

    for (const adapter of this.registry.all()) {
      states[adapter.providerName] = this.breakers.get(adapter.country)?.state ?? 'closed';
    }

    return states;
  }

  private breakerFor(country: CountryCode): CircuitBreaker {
    let breaker = this.breakers.get(country);

    if (!breaker) {
      breaker = new CircuitBreaker(this.policy.breaker);
      this.breakers.set(country, breaker);
    }

    return breaker;
  }
}
