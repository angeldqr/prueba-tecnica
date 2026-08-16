import type { CreditApplicationStatus, ReviewStatus } from '@bravo/contracts';

/**
 * Lo que cada país cambia del flujo base. España manda los importes altos a
 * ADDITIONAL_REVIEW y Brasil pasa por COMPLIANCE_REVIEW; el resto se queda en la
 * revisión manual corriente. Añadir un estado es tocar esta tabla, no un `if`.
 */
export interface StatusFlowOverride {
  /** Destino cuando la evaluación resuelve REVIEW. */
  readonly reviewState: ReviewStatus;
  /** Estados que este país suma al flujo común. */
  readonly additionalStates: readonly CreditApplicationStatus[];
}

export const DEFAULT_STATUS_FLOW: StatusFlowOverride = {
  reviewState: 'MANUAL_REVIEW',
  additionalStates: [],
};
