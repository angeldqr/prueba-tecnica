import type { RuleContext } from './rule-context';

/**
 * `reject` corta la solicitud; `review` la manda al estado de revisión que cada país
 * define en su StatusFlowOverride. Una regla nunca aprueba por sí sola: aprobar es
 * el resultado de que ninguna se haya violado.
 */
export type RuleSeverity = 'reject' | 'review';

export type RuleOutcome =
  | { readonly status: 'passed' }
  | { readonly status: 'deferred'; readonly missing: string }
  | {
      readonly status: 'violated';
      readonly severity: RuleSeverity;
      readonly message: string;
      readonly details?: Readonly<Record<string, unknown>>;
    };

export interface BusinessRule {
  /** Único dentro de su país. Se persiste en la auditoría, así que no cambia a la ligera. */
  readonly code: string;
  readonly description: string;
  readonly requiresBankData: boolean;
  evaluate(context: RuleContext): RuleOutcome;
}

export const PASSED: RuleOutcome = { status: 'passed' };

export function violated(
  severity: RuleSeverity,
  message: string,
  details?: Record<string, unknown>,
): RuleOutcome {
  return details
    ? { status: 'violated', severity, message, details }
    : { status: 'violated', severity, message };
}

export function deferred(missing: string): RuleOutcome {
  return { status: 'deferred', missing };
}
