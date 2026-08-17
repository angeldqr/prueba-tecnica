import {
  CURRENCY_BY_COUNTRY,
  type CountryCode,
  type CreditApplicationStatus,
  type ReviewStatus,
} from '@bravo/contracts';
import { IllegalTransitionError, ValidationError } from '../../../shared/domain';
import type { Applicant } from './applicant';
import type { ApplicationEvent } from './events/application-events';
import type { LoanTerms } from './loan-terms';
import { checkTransition } from './state-machine/state-machine';
import type { Actor } from './state-machine/transitions';

export interface TransitionOptions {
  readonly actor: Actor;
  /** Estado de revisión que admite el país, tomado de su StatusFlowOverride. */
  readonly reviewState: ReviewStatus;
  readonly reason?: string;
  readonly occurredAt?: Date;
}

export interface RehydrateInput {
  readonly id: string;
  readonly country: CountryCode;
  readonly applicant: Applicant;
  readonly terms: LoanTerms;
  readonly status: CreditApplicationStatus;
  readonly version: number;
  readonly createdAt: Date;
}

/**
 * Agregado central. Nadie cambia su estado desde fuera: toda modificación pasa por
 * transitionTo, que consulta la máquina de estados antes de mover nada.
 */
export class CreditApplication {
  private readonly recorded: ApplicationEvent[] = [];

  /**
   * Versión con la que se leyó de la base, que no cambia por mucho que el agregado
   * avance de estado. Es la que va en el WHERE del UPDATE.
   */
  private readonly loadedVersion: number;

  private constructor(
    readonly id: string,
    readonly country: CountryCode,
    readonly applicant: Applicant,
    readonly terms: LoanTerms,
    private currentStatus: CreditApplicationStatus,
    private currentVersion: number,
    readonly createdAt: Date,
  ) {
    this.loadedVersion = currentVersion;
  }

  static create(input: {
    id: string;
    country: CountryCode;
    applicant: Applicant;
    terms: LoanTerms;
    /** Quién da de alta. Un operador puede hacerlo por teléfono en nombre del cliente. */
    actor?: Actor;
    createdAt?: Date;
  }): CreditApplication {
    // LoanTerms toma la moneda de su país, así que esto solo salta si el importe se
    // construyó para un país y la solicitud se está creando para otro.
    if (input.terms.currency !== CURRENCY_BY_COUNTRY[input.country]) {
      throw new ValidationError('La moneda del importe no corresponde al país', {
        country: input.country,
        currency: input.terms.currency,
      });
    }

    const createdAt = input.createdAt ?? new Date();

    const application = new CreditApplication(
      input.id,
      input.country,
      input.applicant,
      input.terms,
      'DRAFT',
      0,
      createdAt,
    );

    application.recorded.push({
      type: 'application.created',
      applicationId: input.id,
      country: input.country,
      occurredAt: createdAt,
      actor: input.actor ?? 'applicant',
      status: 'DRAFT',
    });

    return application;
  }

  /** Reconstruye desde persistencia, sin registrar eventos ni revalidar el flujo. */
  static rehydrate(input: RehydrateInput): CreditApplication {
    return new CreditApplication(
      input.id,
      input.country,
      input.applicant,
      input.terms,
      input.status,
      input.version,
      input.createdAt,
    );
  }

  get status(): CreditApplicationStatus {
    return this.currentStatus;
  }

  /** Versión que tendrá la fila después de guardar. Es la que se escribe. */
  get version(): number {
    return this.currentVersion;
  }

  /**
   * Versión que la fila tenía al leerla. El repositorio escribe con
   * `WHERE version = expectedVersion`, así dos workers que toquen la misma solicitud
   * a la vez no se pisan: el segundo afecta a cero filas y reintenta.
   *
   * Va aparte de `version` porque transitionTo incrementa esta última; usar la ya
   * incrementada en el WHERE no casaría ninguna fila y todo guardado parecería una
   * colisión aunque no hubiera concurrencia ninguna.
   */
  get expectedVersion(): number {
    return this.loadedVersion;
  }

  transitionTo(to: CreditApplicationStatus, options: TransitionOptions): void {
    const check = checkTransition({
      from: this.currentStatus,
      to,
      actor: options.actor,
      reviewState: options.reviewState,
    });

    if (!check.allowed) {
      throw new IllegalTransitionError(this.currentStatus, to);
    }

    const from = this.currentStatus;
    this.currentStatus = to;
    this.currentVersion += 1;

    this.recorded.push({
      type: 'application.status_changed',
      applicationId: this.id,
      country: this.country,
      occurredAt: options.occurredAt ?? new Date(),
      actor: options.actor,
      from,
      to,
      ...(options.reason ? { reason: options.reason } : {}),
    });
  }

  /**
   * Entrega los eventos acumulados y vacía la lista. Se llama una vez, al persistir:
   * devolverlos sin vaciar haría que un segundo guardado duplicara el historial.
   */
  pullEvents(): readonly ApplicationEvent[] {
    return this.recorded.splice(0, this.recorded.length);
  }
}
