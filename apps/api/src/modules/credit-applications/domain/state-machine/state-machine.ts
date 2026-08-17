import { isTerminalStatus, type CreditApplicationStatus, type ReviewStatus } from '@bravo/contracts';
import { TRANSITIONS, isReviewTarget, type Actor } from './transitions';

export interface TransitionRequest {
  readonly from: CreditApplicationStatus;
  readonly to: CreditApplicationStatus;
  readonly actor: Actor;
  /**
   * Único estado de revisión que admite el país, según su StatusFlowOverride. Es lo
   * que impide que una solicitud española acabe en COMPLIANCE_REVIEW, que es un
   * estado del flujo brasileño.
   */
  readonly reviewState: ReviewStatus;
}

export type TransitionRejection =
  'TERMINAL' | 'NOT_ALLOWED' | 'ACTOR_NOT_PERMITTED' | 'REVIEW_STATE_NOT_IN_COUNTRY_FLOW';

export type TransitionCheck =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: TransitionRejection; readonly message: string };

const ALLOWED: TransitionCheck = { allowed: true };

function denied(reason: TransitionRejection, message: string): TransitionCheck {
  return { allowed: false, reason, message };
}

export function checkTransition(request: TransitionRequest): TransitionCheck {
  const { from, to, actor, reviewState } = request;

  if (isTerminalStatus(from)) {
    return denied('TERMINAL', `${from} es un estado final y no admite cambios`);
  }

  const rule = TRANSITIONS[from].find((candidate) => candidate.to === to);

  if (!rule) {
    return denied('NOT_ALLOWED', `No se puede pasar de ${from} a ${to}`);
  }

  if (!rule.actors.includes(actor)) {
    return denied('ACTOR_NOT_PERMITTED', `Un ${actor} no puede pasar una solicitud de ${from} a ${to}`);
  }

  // El flujo base ofrece los tres estados de revisión; cada país solo usa el suyo.
  if (isReviewTarget(to) && to !== reviewState) {
    return denied(
      'REVIEW_STATE_NOT_IN_COUNTRY_FLOW',
      `El flujo de este país deriva a ${reviewState}, no a ${to}`,
    );
  }

  return ALLOWED;
}

/**
 * Transiciones que este actor puede provocar ahora mismo.
 *
 * El selector del frontend se construye con esto, así no duplica las reglas ni ofrece
 * un cambio que la API va a rechazar.
 */
export function allowedTransitionsFrom(
  from: CreditApplicationStatus,
  actor: Actor,
  reviewState: ReviewStatus,
): readonly CreditApplicationStatus[] {
  if (isTerminalStatus(from)) return [];

  return TRANSITIONS[from]
    .filter((rule) => checkTransition({ from, to: rule.to, actor, reviewState }).allowed)
    .map((rule) => rule.to);
}
