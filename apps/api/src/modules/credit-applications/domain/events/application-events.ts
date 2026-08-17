import type { CountryCode, CreditApplicationStatus } from '@bravo/contracts';
import type { Actor } from '../state-machine/transitions';

/**
 * Lo que el agregado registra al cambiar.
 *
 * No son los eventos que disparan el trabajo asíncrono: de eso se encarga el trigger
 * de PostgreSQL, que escribe en el outbox dentro de la misma transacción y no puede
 * desincronizarse del cambio. Estos sirven para que el repositorio persista el
 * historial de estados y para que el caso de uso sepa qué acaba de pasar sin releer.
 */
export type ApplicationEventType = 'application.created' | 'application.status_changed';

interface BaseEvent {
  readonly type: ApplicationEventType;
  readonly applicationId: string;
  readonly country: CountryCode;
  readonly occurredAt: Date;
  readonly actor: Actor;
}

export interface ApplicationCreatedEvent extends BaseEvent {
  readonly type: 'application.created';
  readonly status: CreditApplicationStatus;
}

export interface ApplicationStatusChangedEvent extends BaseEvent {
  readonly type: 'application.status_changed';
  readonly from: CreditApplicationStatus;
  readonly to: CreditApplicationStatus;
  readonly reason?: string;
}

export type ApplicationEvent = ApplicationCreatedEvent | ApplicationStatusChangedEvent;
