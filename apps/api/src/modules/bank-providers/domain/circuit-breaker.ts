export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  /** Fallos seguidos que abren el circuito. */
  readonly failureThreshold: number;
  /** Éxitos seguidos en half-open que lo vuelven a cerrar, y tope de sondas a la vez. */
  readonly successThreshold: number;
  /** Cuánto se queda abierto antes de dejar pasar una sonda. */
  readonly openMs: number;
  /** Inyectable para poder probar el paso del tiempo sin esperarlo. */
  readonly now?: () => number;
}

/**
 * Corta las llamadas a un proveedor que está caído en vez de seguir esperando su
 * timeout en cada solicitud. Sin esto, un proveedor lento no tumba solo su país:
 * agota el pool de conexiones y arrastra al resto.
 *
 * Es lógica pura y sin temporizadores; el reloj entra por parámetro.
 *
 * Quien llame tiene que cerrar siempre el ciclo con recordSuccess, recordFailure o
 * recordIgnored: en half-open las sondas van contadas y una que no se resuelva
 * ocuparía su hueco para siempre.
 */
export class CircuitBreaker {
  private currentState: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private probesInFlight = 0;
  private retryAt = 0;

  private readonly now: () => number;

  constructor(private readonly options: CircuitBreakerOptions) {
    this.now = options.now ?? (() => Date.now());
  }

  get state(): CircuitState {
    return this.currentState;
  }

  /** Instante a partir del cual se admite una sonda. Solo tiene sentido si está abierto. */
  get retryAtMs(): number {
    return this.retryAt;
  }

  /**
   * Además de responder, hace pasar el circuito de abierto a half-open cuando ya ha
   * cumplido su tiempo: el estado avanza al consultarlo, no con un temporizador.
   */
  canAttempt(): boolean {
    if (this.currentState === 'open') {
      if (this.now() < this.retryAt) return false;

      this.currentState = 'half-open';
      this.consecutiveSuccesses = 0;
      this.probesInFlight = 0;
    }

    if (this.currentState === 'half-open') {
      // Se dejan pasar tantas sondas como éxitos hagan falta para cerrar, y ni una
      // más. Sin este tope, todo lo que se hubiera encolado durante la caída saldría
      // en bloque contra un proveedor que acaba de intentar levantarse.
      if (this.probesInFlight >= this.options.successThreshold) return false;

      this.probesInFlight += 1;
    }

    return true;
  }

  recordSuccess(): void {
    if (this.currentState === 'half-open') {
      this.probesInFlight = Math.max(0, this.probesInFlight - 1);
      this.consecutiveSuccesses += 1;

      if (this.consecutiveSuccesses >= this.options.successThreshold) {
        this.close();
      }

      return;
    }

    // Estando abierto, un éxito solo puede venir de una petición que salió antes de
    // abrirlo. No prueba que el proveedor se haya recuperado, así que no acorta la
    // ventana: la sonda decidirá cuando toque.
    if (this.currentState === 'closed') {
      this.consecutiveFailures = 0;
    }
  }

  recordFailure(): void {
    // Un solo fallo durante la sonda vuelve a abrirlo: si sigue roto, no se le dan
    // más oportunidades hasta que pase otra ventana entera.
    if (this.currentState === 'half-open') {
      this.open();
      return;
    }

    if (this.currentState === 'open') return;

    this.consecutiveFailures += 1;

    if (this.consecutiveFailures >= this.options.failureThreshold) {
      this.open();
    }
  }

  /**
   * La operación terminó, pero su resultado no dice nada del proveedor: un documento
   * mal formado o una respuesta que incumple el contrato. Libera la sonda sin contar
   * ni como acierto ni como fallo.
   */
  recordIgnored(): void {
    if (this.currentState === 'half-open') {
      this.probesInFlight = Math.max(0, this.probesInFlight - 1);
    }
  }

  private open(): void {
    this.currentState = 'open';
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.probesInFlight = 0;
    this.retryAt = this.now() + this.options.openMs;
  }

  private close(): void {
    this.currentState = 'closed';
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.probesInFlight = 0;
    this.retryAt = 0;
  }
}
