import { describe, expect, it } from 'vitest';
import { PASSED, deferred, violated, type BusinessRule } from './business-rule';
import type { RuleContext } from './rule-context';
import { evaluateRules } from './rule-evaluation';

const CONTEXT: RuleContext = {
  country: 'ES',
  requestedAmountMinor: 500_000,
  currency: 'EUR',
  termMonths: 36,
  applicant: {
    monthlyIncomeMinor: 250_000,
    employmentMonths: 36,
    birthDate: new Date('1990-06-15T00:00:00Z'),
  },
  evaluatedAt: new Date('2026-01-15T00:00:00Z'),
};

function rule(code: string, outcome: BusinessRule['evaluate']): BusinessRule {
  return { code, description: code, requiresBankData: false, evaluate: outcome };
}

const passes = (code: string) => rule(code, () => PASSED);
const rejects = (code: string) => rule(code, () => violated('reject', code));
const reviews = (code: string) => rule(code, () => violated('review', code));
const defers = (code: string) => rule(code, () => deferred('bank.creditScore'));

describe('evaluateRules', () => {
  it('aprueba cuando ninguna regla se viola', () => {
    const result = evaluateRules('ES', [passes('A'), passes('B')], CONTEXT);

    expect(result).toMatchObject({
      country: 'ES',
      decision: 'APPROVE',
      violations: [],
      deferredRules: [],
      evaluatedRules: 2,
    });
  });

  it('sin reglas la decisión es aprobar', () => {
    expect(evaluateRules('ES', [], CONTEXT).decision).toBe('APPROVE');
  });

  it('acumula todas las violaciones en vez de cortar en la primera', () => {
    const result = evaluateRules('ES', [rejects('A'), passes('B'), reviews('C')], CONTEXT);

    expect(result.violations.map((violation) => violation.code)).toEqual(['A', 'C']);
  });

  it('un rechazo gana sobre una revisión', () => {
    expect(evaluateRules('ES', [reviews('A'), rejects('B')], CONTEXT).decision).toBe('REJECT');
  });

  it('un rechazo gana sobre un aplazamiento: los datos que faltan no lo salvarían', () => {
    expect(evaluateRules('ES', [defers('A'), rejects('B')], CONTEXT).decision).toBe('REJECT');
  });

  it('un aplazamiento gana sobre una revisión: el analista necesita el expediente completo', () => {
    const result = evaluateRules('ES', [reviews('A'), defers('B')], CONTEXT);

    expect(result.decision).toBe('PENDING_BANK_DATA');
    expect(result.deferredRules).toEqual(['B']);
    expect(result.violations.map((violation) => violation.code)).toEqual(['A']);
  });

  it('solo revisiones resuelve en revisión', () => {
    expect(evaluateRules('ES', [reviews('A'), passes('B')], CONTEXT).decision).toBe('REVIEW');
  });

  it('arrastra el detalle de la regla a la violación', () => {
    const withDetails = rule('A', () => violated('reject', 'fuera de rango', { max: 10 }));
    const [violation] = evaluateRules('ES', [withDetails], CONTEXT).violations;

    expect(violation).toMatchObject({
      code: 'A',
      severity: 'reject',
      message: 'fuera de rango',
      details: { max: 10 },
    });
  });

  it('omite la clave details cuando la regla no aporta ninguno', () => {
    const [violation] = evaluateRules('ES', [rejects('A')], CONTEXT).violations;

    expect(violation && 'details' in violation).toBe(false);
  });
});
