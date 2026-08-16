import { describe, expect, it } from 'vitest';
import type { CountryLimits } from '../country-limits';
import type { ApplicantProfile, BankAssessment, RuleContext } from '../rule-context';
import { ageAt } from '../rule-context';
import {
  ageWithinLimits,
  amountReviewThreshold,
  amountToIncomeRatio,
  amountWithinLimits,
  debtToIncomeRatio,
  estimatedInstallmentMinor,
  maximumDelinquencies,
  minimumCreditScore,
  minimumEmployment,
  minimumMonthlyIncome,
  termWithinLimits,
  totalDebtToIncomeRatio,
} from './common-rules';

const LIMITS: CountryLimits = {
  minAmountMinor: 100_000,
  maxAmountMinor: 1_000_000,
  minTermMonths: 12,
  maxTermMonths: 60,
  minAge: 18,
  maxAge: 70,
  currency: 'EUR',
};

const BANK: BankAssessment = {
  monthlyDebtPaymentsMinor: 20_000,
  totalDebtMinor: 300_000,
  creditScore: 750,
  delinquencies: 0,
  activeLoans: 1,
};

type ContextOverrides = Partial<Omit<RuleContext, 'applicant'>> & {
  applicant?: Partial<ApplicantProfile>;
};

function context({ applicant, ...rest }: ContextOverrides = {}): RuleContext {
  return {
    country: 'ES',
    requestedAmountMinor: 500_000,
    currency: 'EUR',
    termMonths: 36,
    evaluatedAt: new Date('2026-01-15T00:00:00Z'),
    ...rest,
    applicant: {
      monthlyIncomeMinor: 250_000,
      employmentMonths: 36,
      birthDate: new Date('1990-06-15T00:00:00Z'),
      ...applicant,
    },
  };
}

describe('ageAt', () => {
  it('descuenta el año cuando aún no ha llegado el cumpleaños', () => {
    const birth = new Date('1990-06-15T00:00:00Z');

    expect(ageAt(birth, new Date('2026-06-14T00:00:00Z'))).toBe(35);
    expect(ageAt(birth, new Date('2026-06-15T00:00:00Z'))).toBe(36);
  });
});

describe('estimatedInstallmentMinor', () => {
  it('reparte el importe entre los meses redondeando hacia arriba', () => {
    expect(estimatedInstallmentMinor(context({ requestedAmountMinor: 1_000, termMonths: 3 }))).toBe(334);
  });
});

describe('amountWithinLimits', () => {
  const rule = amountWithinLimits(LIMITS);

  it('acepta un importe dentro del rango', () => {
    expect(rule.evaluate(context()).status).toBe('passed');
  });

  it('acepta exactamente el mínimo y el máximo', () => {
    expect(rule.evaluate(context({ requestedAmountMinor: 100_000 })).status).toBe('passed');
    expect(rule.evaluate(context({ requestedAmountMinor: 1_000_000 })).status).toBe('passed');
  });

  it('rechaza por debajo del mínimo', () => {
    expect(rule.evaluate(context({ requestedAmountMinor: 99_999 }))).toMatchObject({
      status: 'violated',
      severity: 'reject',
    });
  });

  it('rechaza por encima del máximo', () => {
    expect(rule.evaluate(context({ requestedAmountMinor: 1_000_001 }))).toMatchObject({
      status: 'violated',
      severity: 'reject',
    });
  });

  it('no necesita datos bancarios', () => {
    expect(rule.requiresBankData).toBe(false);
  });
});

describe('termWithinLimits', () => {
  const rule = termWithinLimits(LIMITS);

  it('acepta los extremos del rango', () => {
    expect(rule.evaluate(context({ termMonths: 12 })).status).toBe('passed');
    expect(rule.evaluate(context({ termMonths: 60 })).status).toBe('passed');
  });

  it('rechaza fuera del rango', () => {
    expect(rule.evaluate(context({ termMonths: 11 })).status).toBe('violated');
    expect(rule.evaluate(context({ termMonths: 61 })).status).toBe('violated');
  });
});

describe('ageWithinLimits', () => {
  const rule = ageWithinLimits(LIMITS);

  it('acepta a quien cumple la edad mínima el día de la evaluación', () => {
    const outcome = rule.evaluate(context({ applicant: { birthDate: new Date('2008-01-15T00:00:00Z') } }));

    expect(outcome.status).toBe('passed');
  });

  it('rechaza por un día de diferencia', () => {
    const outcome = rule.evaluate(context({ applicant: { birthDate: new Date('2008-01-16T00:00:00Z') } }));

    expect(outcome).toMatchObject({ status: 'violated', severity: 'reject' });
  });

  it('rechaza por encima de la edad máxima', () => {
    const outcome = rule.evaluate(context({ applicant: { birthDate: new Date('1950-01-15T00:00:00Z') } }));

    expect(outcome).toMatchObject({ status: 'violated', severity: 'reject' });
  });
});

describe('minimumMonthlyIncome', () => {
  const rule = minimumMonthlyIncome({ minMinor: 90_000 });

  it('acepta el mínimo exacto', () => {
    expect(rule.evaluate(context({ applicant: { monthlyIncomeMinor: 90_000 } })).status).toBe('passed');
  });

  it('rechaza por debajo', () => {
    expect(rule.evaluate(context({ applicant: { monthlyIncomeMinor: 89_999 } }))).toMatchObject({
      status: 'violated',
      severity: 'reject',
    });
  });

  it('respeta la severidad indicada', () => {
    const soft = minimumMonthlyIncome({ minMinor: 90_000, severity: 'review' });

    expect(soft.evaluate(context({ applicant: { monthlyIncomeMinor: 1 } }))).toMatchObject({
      severity: 'review',
    });
  });
});

describe('minimumEmployment', () => {
  const rule = minimumEmployment({ months: 12 });

  it('por defecto manda a revisión, no rechaza', () => {
    expect(rule.evaluate(context({ applicant: { employmentMonths: 3 } }))).toMatchObject({
      status: 'violated',
      severity: 'review',
    });
  });

  it('acepta la antigüedad justa', () => {
    expect(rule.evaluate(context({ applicant: { employmentMonths: 12 } })).status).toBe('passed');
  });
});

describe('amountToIncomeRatio', () => {
  it('mide contra el ingreso anual cuando la base es anual', () => {
    const rule = amountToIncomeRatio({ maxMultiplier: 8, basis: 'annual' });
    // 250.000 × 12 × 8 = 24.000.000
    expect(rule.evaluate(context({ requestedAmountMinor: 24_000_000 })).status).toBe('passed');
    expect(rule.evaluate(context({ requestedAmountMinor: 24_000_001 })).status).toBe('violated');
  });

  it('mide contra el ingreso mensual cuando la base es mensual', () => {
    const rule = amountToIncomeRatio({ maxMultiplier: 6, basis: 'monthly' });

    expect(rule.evaluate(context({ requestedAmountMinor: 1_500_000 })).status).toBe('passed');
    expect(rule.evaluate(context({ requestedAmountMinor: 1_500_001 })).status).toBe('violated');
  });

  it('sin ingreso declarado no divide entre cero: viola la regla', () => {
    const rule = amountToIncomeRatio({ maxMultiplier: 6, basis: 'monthly' });

    expect(rule.evaluate(context({ applicant: { monthlyIncomeMinor: 0 } }))).toMatchObject({
      status: 'violated',
    });
  });
});

describe('debtToIncomeRatio', () => {
  const rule = debtToIncomeRatio({ max: 0.35 });

  it('se aplaza mientras no hay datos bancarios', () => {
    expect(rule.evaluate(context())).toMatchObject({ status: 'deferred' });
    expect(rule.requiresBankData).toBe(true);
  });

  it('acepta cuando el esfuerzo total cabe en el umbral', () => {
    expect(rule.evaluate(context({ bank: BANK })).status).toBe('passed');
  });

  it('suma la cuota estimada de la solicitud en curso', () => {
    // 74.000 de cuotas vigentes son el 29,6 % del ingreso y por sí solas pasarían.
    // Con los 13.889 de la solicitud en curso el esfuerzo sube al 35,2 % y se rechaza.
    const previous = { ...BANK, monthlyDebtPaymentsMinor: 74_000 };

    expect(rule.evaluate(context({ bank: previous }))).toMatchObject({
      status: 'violated',
      severity: 'reject',
    });
  });
});

describe('totalDebtToIncomeRatio', () => {
  const rule = totalDebtToIncomeRatio({ max: 12 });

  it('se aplaza sin datos bancarios', () => {
    expect(rule.evaluate(context())).toMatchObject({ status: 'deferred' });
  });

  it('compara la deuda viva contra el ingreso mensual', () => {
    expect(rule.evaluate(context({ bank: { ...BANK, totalDebtMinor: 3_000_000 } })).status).toBe('passed');
    expect(rule.evaluate(context({ bank: { ...BANK, totalDebtMinor: 3_000_001 } })).status).toBe('violated');
  });
});

describe('minimumCreditScore', () => {
  const rule = minimumCreditScore({ min: 500 });

  it('se aplaza sin datos bancarios', () => {
    expect(rule.evaluate(context())).toMatchObject({ status: 'deferred' });
  });

  it('acepta el mínimo exacto y rechaza justo por debajo', () => {
    expect(rule.evaluate(context({ bank: { ...BANK, creditScore: 500 } })).status).toBe('passed');
    expect(rule.evaluate(context({ bank: { ...BANK, creditScore: 499 } })).status).toBe('violated');
  });
});

describe('maximumDelinquencies', () => {
  const rule = maximumDelinquencies({ max: 0 });

  it('acepta el historial limpio y rechaza el primer impago', () => {
    expect(rule.evaluate(context({ bank: BANK })).status).toBe('passed');
    expect(rule.evaluate(context({ bank: { ...BANK, delinquencies: 1 } })).status).toBe('violated');
  });
});

describe('amountReviewThreshold', () => {
  const rule = amountReviewThreshold({ thresholdMinor: 1_500_000 });

  it('manda a revisión sin rechazar', () => {
    expect(rule.evaluate(context({ requestedAmountMinor: 1_500_001 }))).toMatchObject({
      status: 'violated',
      severity: 'review',
    });
  });

  it('el umbral exacto todavía pasa', () => {
    expect(rule.evaluate(context({ requestedAmountMinor: 1_500_000 })).status).toBe('passed');
  });
});
