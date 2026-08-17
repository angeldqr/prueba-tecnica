/**
 * Estados por los que pasa una solicitud. El flujo base es común a los seis países;
 * cada uno decide a cuál de los estados de revisión deriva (ver StatusFlowOverride).
 */
export const CREDIT_APPLICATION_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'BANK_DATA_PENDING',
  'BANK_DATA_RECEIVED',
  'BANK_DATA_UNAVAILABLE',
  'RISK_EVALUATING',
  'AUTO_APPROVED',
  'ADDITIONAL_REVIEW',
  'MANUAL_REVIEW',
  'COMPLIANCE_REVIEW',
  'APPROVED',
  'REJECTED',
  'DISBURSED',
  'CANCELLED',
  'EXPIRED',
] as const;

export type CreditApplicationStatus = (typeof CREDIT_APPLICATION_STATUSES)[number];

export function isCreditApplicationStatus(value: unknown): value is CreditApplicationStatus {
  return typeof value === 'string' && (CREDIT_APPLICATION_STATUSES as readonly string[]).includes(value);
}

/**
 * Una vez aquí la solicitud ya no se mueve.
 *
 * APPROVED no está en la lista y no es un descuido: aprobar no cierra el expediente,
 * todavía queda desembolsar. Contarlo como final lo sacaría del índice de expedientes
 * vivos y, peor, del índice único de documento: el titular podría abrir una segunda
 * solicitud mientras la primera sigue aprobada y sin cobrar.
 */
export const TERMINAL_STATUSES = [
  'REJECTED',
  'DISBURSED',
  'CANCELLED',
  'EXPIRED',
] as const satisfies readonly CreditApplicationStatus[];

export type TerminalStatus = (typeof TERMINAL_STATUSES)[number];

export function isTerminalStatus(status: CreditApplicationStatus): status is TerminalStatus {
  return (TERMINAL_STATUSES as readonly CreditApplicationStatus[]).includes(status);
}

/**
 * Solicitudes en curso. Sobre esta lista se construye el índice parcial de Postgres:
 * la mayor parte de las consultas operativas solo mira expedientes vivos.
 */
export const ACTIVE_STATUSES = CREDIT_APPLICATION_STATUSES.filter((status) => !isTerminalStatus(status));

/** Estados en los que un humano tiene que intervenir. */
export const REVIEW_STATUSES = [
  'ADDITIONAL_REVIEW',
  'MANUAL_REVIEW',
  'COMPLIANCE_REVIEW',
] as const satisfies readonly CreditApplicationStatus[];

export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
