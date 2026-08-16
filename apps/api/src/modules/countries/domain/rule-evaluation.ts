import type { CountryCode } from '@bravo/contracts';
import type { BusinessRule, RuleSeverity } from './business-rule';
import type { RuleContext } from './rule-context';

export type RuleDecision = 'APPROVE' | 'REVIEW' | 'REJECT' | 'PENDING_BANK_DATA';

export interface RuleViolation {
  readonly code: string;
  readonly severity: RuleSeverity;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface RuleEvaluation {
  readonly country: CountryCode;
  readonly decision: RuleDecision;
  readonly violations: readonly RuleViolation[];
  /** Reglas que no se pudieron resolver por falta de datos del proveedor bancario. */
  readonly deferredRules: readonly string[];
  readonly evaluatedRules: number;
}

/**
 * Evalúa todas las reglas y acumula. No corta en la primera violación a propósito:
 * al solicitante se le devuelve la lista completa de motivos, no el primero que
 * saltó, y el analista ve el cuadro entero de una vez.
 */
export function evaluateRules(
  country: CountryCode,
  rules: readonly BusinessRule[],
  context: RuleContext,
): RuleEvaluation {
  const violations: RuleViolation[] = [];
  const deferredRules: string[] = [];

  for (const rule of rules) {
    const outcome = rule.evaluate(context);

    if (outcome.status === 'violated') {
      violations.push({
        code: rule.code,
        severity: outcome.severity,
        message: outcome.message,
        ...(outcome.details ? { details: outcome.details } : {}),
      });
    } else if (outcome.status === 'deferred') {
      deferredRules.push(rule.code);
    }
  }

  return {
    country,
    decision: decide(violations, deferredRules),
    violations,
    deferredRules,
    evaluatedRules: rules.length,
  };
}

/**
 * Un rechazo firme gana sobre cualquier aplazamiento: si con los datos que ya hay la
 * solicitud no sale adelante, esperar al proveedor bancario no la va a salvar. Por
 * el mismo motivo el aplazamiento gana sobre la revisión: mandar un expediente a un
 * analista con datos a medias le hace perder el tiempo dos veces.
 */
function decide(violations: readonly RuleViolation[], deferredRules: readonly string[]): RuleDecision {
  if (violations.some((violation) => violation.severity === 'reject')) return 'REJECT';
  if (deferredRules.length > 0) return 'PENDING_BANK_DATA';
  if (violations.length > 0) return 'REVIEW';

  return 'APPROVE';
}
