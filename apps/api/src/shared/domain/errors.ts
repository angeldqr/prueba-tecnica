/**
 * Taxonomía de errores de dominio. El dominio no sabe qué es un código HTTP: lanza
 * uno de estos y el filtro de excepciones se encarga de traducirlo en el borde.
 */
export type DomainErrorCode =
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'BUSINESS_RULE_VIOLATION'
  | 'ILLEGAL_TRANSITION'
  | 'DEPENDENCY_UNAVAILABLE';

export abstract class DomainError extends Error {
  abstract readonly code: DomainErrorCode;

  /** Contexto adicional para el cliente. Nunca lleva PII ni datos bancarios. */
  readonly details: Readonly<Record<string, unknown>>;

  protected constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = new.target.name;
    this.details = details;
  }
}

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_FAILED' as const;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
  }
}

export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND' as const;

  constructor(resource: string, identifier?: string) {
    super(`${resource} no encontrado`, identifier ? { resource, identifier } : { resource });
  }
}

export class ConflictError extends DomainError {
  readonly code = 'CONFLICT' as const;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
  }
}

export class ForbiddenError extends DomainError {
  readonly code = 'FORBIDDEN' as const;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
  }
}

export class BusinessRuleViolationError extends DomainError {
  readonly code = 'BUSINESS_RULE_VIOLATION' as const;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
  }
}

export class IllegalTransitionError extends DomainError {
  readonly code = 'ILLEGAL_TRANSITION' as const;

  constructor(from: string, to: string) {
    super(`No se puede pasar de ${from} a ${to}`, { from, to });
  }
}

/** Un tercero no respondió. Distinto de un fallo nuestro: casi siempre se reintenta. */
export class DependencyUnavailableError extends DomainError {
  readonly code = 'DEPENDENCY_UNAVAILABLE' as const;

  constructor(dependency: string, reason?: string) {
    super(`${dependency} no está disponible`, reason ? { dependency, reason } : { dependency });
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
