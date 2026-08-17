import type { CreditApplicationStatus } from '@bravo/contracts';

export const ACTORS = ['applicant', 'system', 'analyst', 'admin'] as const;

export type Actor = (typeof ACTORS)[number];

export interface TransitionRule {
  readonly to: CreditApplicationStatus;
  /** Quién puede provocarla. Un solicitante no aprueba su propio crédito. */
  readonly actors: readonly Actor[];
  readonly description: string;
}

/**
 * El flujo entero como dato, no como código.
 *
 * Añadir un estado o cambiar quién puede mover una solicitud es editar esta tabla;
 * no hay un solo `if` repartido por los casos de uso que haya que ir a buscar. Es
 * también lo que permite que el frontend ofrezca únicamente las transiciones legales,
 * porque puede preguntarlas en vez de replicar la lógica.
 */
export const TRANSITIONS: Readonly<Record<CreditApplicationStatus, readonly TransitionRule[]>> = {
  DRAFT: [
    { to: 'SUBMITTED', actors: ['applicant', 'admin'], description: 'El solicitante la envía' },
    { to: 'CANCELLED', actors: ['applicant', 'admin'], description: 'Se descarta antes de enviar' },
  ],

  SUBMITTED: [
    {
      to: 'BANK_DATA_PENDING',
      actors: ['system'],
      description: 'Se encola el enriquecimiento bancario',
    },
    {
      to: 'REJECTED',
      actors: ['system'],
      description: 'Incumple una regla que no necesita datos bancarios',
    },
    { to: 'CANCELLED', actors: ['applicant', 'admin'], description: 'Se retira la solicitud' },
  ],

  BANK_DATA_PENDING: [
    { to: 'BANK_DATA_RECEIVED', actors: ['system'], description: 'El proveedor respondió' },
    {
      to: 'BANK_DATA_UNAVAILABLE',
      actors: ['system'],
      description: 'El proveedor no respondió tras agotar los reintentos',
    },
    { to: 'CANCELLED', actors: ['applicant', 'admin'], description: 'Se retira la solicitud' },
  ],

  BANK_DATA_UNAVAILABLE: [
    {
      to: 'BANK_DATA_PENDING',
      actors: ['system'],
      description: 'Se reintenta cuando el circuito vuelve a cerrarse',
    },
    {
      to: 'MANUAL_REVIEW',
      actors: ['system', 'analyst'],
      description: 'Se decide a mano si el proveedor sigue sin responder',
    },
    { to: 'CANCELLED', actors: ['applicant', 'admin'], description: 'Se retira la solicitud' },
    { to: 'EXPIRED', actors: ['system'], description: 'Caduca sin haber podido evaluarse' },
  ],

  BANK_DATA_RECEIVED: [
    { to: 'RISK_EVALUATING', actors: ['system'], description: 'Empieza la evaluación de riesgo' },
    { to: 'CANCELLED', actors: ['applicant', 'admin'], description: 'Se retira la solicitud' },
  ],

  RISK_EVALUATING: [
    { to: 'AUTO_APPROVED', actors: ['system'], description: 'Ninguna regla se violó' },
    {
      to: 'ADDITIONAL_REVIEW',
      actors: ['system'],
      description: 'Revisión adicional del país (España)',
    },
    { to: 'MANUAL_REVIEW', actors: ['system'], description: 'Revisión manual ordinaria' },
    {
      to: 'COMPLIANCE_REVIEW',
      actors: ['system'],
      description: 'Revisión de cumplimiento del país (Brasil)',
    },
    { to: 'REJECTED', actors: ['system'], description: 'Se violó una regla excluyente' },
  ],

  AUTO_APPROVED: [
    { to: 'APPROVED', actors: ['system'], description: 'Se confirma la aprobación automática' },
    { to: 'CANCELLED', actors: ['applicant', 'admin'], description: 'Se retira la solicitud' },
  ],

  ADDITIONAL_REVIEW: [
    { to: 'APPROVED', actors: ['analyst', 'admin'], description: 'El analista la aprueba' },
    { to: 'REJECTED', actors: ['analyst', 'admin'], description: 'El analista la deniega' },
    { to: 'CANCELLED', actors: ['applicant', 'admin'], description: 'Se retira la solicitud' },
    { to: 'EXPIRED', actors: ['system'], description: 'Caduca sin que nadie la revise' },
  ],

  MANUAL_REVIEW: [
    { to: 'APPROVED', actors: ['analyst', 'admin'], description: 'El analista la aprueba' },
    { to: 'REJECTED', actors: ['analyst', 'admin'], description: 'El analista la deniega' },
    { to: 'CANCELLED', actors: ['applicant', 'admin'], description: 'Se retira la solicitud' },
    { to: 'EXPIRED', actors: ['system'], description: 'Caduca sin que nadie la revise' },
  ],

  COMPLIANCE_REVIEW: [
    { to: 'APPROVED', actors: ['analyst', 'admin'], description: 'Cumplimiento da el visto bueno' },
    { to: 'REJECTED', actors: ['analyst', 'admin'], description: 'Cumplimiento la deniega' },
    { to: 'CANCELLED', actors: ['applicant', 'admin'], description: 'Se retira la solicitud' },
    { to: 'EXPIRED', actors: ['system'], description: 'Caduca sin que nadie la revise' },
  ],

  APPROVED: [
    { to: 'DISBURSED', actors: ['admin'], description: 'Se desembolsa el importe' },
    { to: 'CANCELLED', actors: ['applicant', 'admin'], description: 'Se retira antes de cobrar' },
    { to: 'EXPIRED', actors: ['system'], description: 'Caduca la oferta sin desembolsar' },
  ],

  // Estados finales: una solicitud que llega aquí ya no se mueve.
  REJECTED: [],
  DISBURSED: [],
  CANCELLED: [],
  EXPIRED: [],
};

/** Estados de revisión a los que puede derivar una evaluación. */
export const REVIEW_TARGETS = [
  'ADDITIONAL_REVIEW',
  'MANUAL_REVIEW',
  'COMPLIANCE_REVIEW',
] as const satisfies readonly CreditApplicationStatus[];

export function isReviewTarget(status: CreditApplicationStatus): status is (typeof REVIEW_TARGETS)[number] {
  return (REVIEW_TARGETS as readonly CreditApplicationStatus[]).includes(status);
}
