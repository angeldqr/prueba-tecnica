import { PASSED, deferred, violated, type BusinessRule, type RuleSeverity } from '../business-rule';
import type { CountryLimits } from '../country-limits';
import { ageAt, annualIncomeMinor, type RuleContext } from '../rule-context';

/**
 * Fábricas de reglas reutilizables. Cada país compone las que le aplican con sus
 * propios umbrales, de modo que un ruleset se lee como la ficha de producto y no
 * como código: los seis ficheros de país no repiten un solo cálculo.
 */

/**
 * Cuota estimada de la solicitud en curso. Reparto lineal sin intereses: basta para
 * medir el esfuerzo del solicitante en la fase de admisión. La cuota real, con el
 * tipo aplicado y la amortización francesa, la calcula el motor de precios cuando
 * la operación ya está aprobada.
 */
export function estimatedInstallmentMinor(context: RuleContext): number {
  return Math.ceil(context.requestedAmountMinor / context.termMonths);
}

export function amountWithinLimits(limits: CountryLimits): BusinessRule {
  return {
    code: 'AMOUNT_WITHIN_LIMITS',
    description: `Importe entre ${limits.minAmountMinor} y ${limits.maxAmountMinor} ${limits.currency}`,
    requiresBankData: false,
    evaluate: (context) => {
      const { requestedAmountMinor } = context;

      if (requestedAmountMinor < limits.minAmountMinor) {
        return violated('reject', 'El importe está por debajo del mínimo del país', {
          requestedAmountMinor,
          minAmountMinor: limits.minAmountMinor,
        });
      }

      if (requestedAmountMinor > limits.maxAmountMinor) {
        return violated('reject', 'El importe supera el máximo del país', {
          requestedAmountMinor,
          maxAmountMinor: limits.maxAmountMinor,
        });
      }

      return PASSED;
    },
  };
}

export function termWithinLimits(limits: CountryLimits): BusinessRule {
  return {
    code: 'TERM_WITHIN_LIMITS',
    description: `Plazo entre ${limits.minTermMonths} y ${limits.maxTermMonths} meses`,
    requiresBankData: false,
    evaluate: (context) => {
      const { termMonths } = context;

      if (termMonths < limits.minTermMonths || termMonths > limits.maxTermMonths) {
        return violated('reject', 'El plazo está fuera del rango permitido', {
          termMonths,
          minTermMonths: limits.minTermMonths,
          maxTermMonths: limits.maxTermMonths,
        });
      }

      return PASSED;
    },
  };
}

export function ageWithinLimits(limits: CountryLimits): BusinessRule {
  return {
    code: 'AGE_WITHIN_LIMITS',
    description: `Edad entre ${limits.minAge} y ${limits.maxAge} años`,
    requiresBankData: false,
    evaluate: (context) => {
      const age = ageAt(context.applicant.birthDate, context.evaluatedAt);

      if (age < limits.minAge) {
        return violated('reject', 'El solicitante no alcanza la edad mínima', {
          age,
          minAge: limits.minAge,
        });
      }

      if (age > limits.maxAge) {
        return violated('reject', 'El solicitante supera la edad máxima', {
          age,
          maxAge: limits.maxAge,
        });
      }

      return PASSED;
    },
  };
}

export function minimumMonthlyIncome(options: { minMinor: number; severity?: RuleSeverity }): BusinessRule {
  const severity = options.severity ?? 'reject';

  return {
    code: 'MINIMUM_MONTHLY_INCOME',
    description: `Ingreso mensual mínimo de ${options.minMinor}`,
    requiresBankData: false,
    evaluate: (context) => {
      const income = context.applicant.monthlyIncomeMinor;

      return income < options.minMinor
        ? violated(severity, 'El ingreso mensual no alcanza el mínimo exigido', {
            monthlyIncomeMinor: income,
            minMinor: options.minMinor,
          })
        : PASSED;
    },
  };
}

export function minimumEmployment(options: { months: number; severity?: RuleSeverity }): BusinessRule {
  const severity = options.severity ?? 'review';

  return {
    code: 'MINIMUM_EMPLOYMENT',
    description: `Antigüedad laboral mínima de ${options.months} meses`,
    requiresBankData: false,
    evaluate: (context) => {
      const months = context.applicant.employmentMonths;

      return months < options.months
        ? violated(severity, 'La antigüedad laboral es insuficiente', {
            employmentMonths: months,
            requiredMonths: options.months,
          })
        : PASSED;
    },
  };
}

/** Tope del importe como múltiplo del ingreso, mensual o anual según el país. */
export function amountToIncomeRatio(options: {
  maxMultiplier: number;
  basis: 'monthly' | 'annual';
  severity?: RuleSeverity;
}): BusinessRule {
  const severity = options.severity ?? 'reject';

  return {
    code: 'AMOUNT_TO_INCOME_RATIO',
    description: `Importe hasta ${options.maxMultiplier}× el ingreso ${options.basis === 'annual' ? 'anual' : 'mensual'}`,
    requiresBankData: false,
    evaluate: (context) => {
      const income =
        options.basis === 'annual'
          ? annualIncomeMinor(context.applicant)
          : context.applicant.monthlyIncomeMinor;

      if (income <= 0) {
        return violated(severity, 'No hay ingreso declarado sobre el que calcular el múltiplo');
      }

      const ratio = context.requestedAmountMinor / income;

      return ratio > options.maxMultiplier
        ? violated(severity, 'El importe supera el múltiplo de ingreso permitido', {
            ratio: round(ratio),
            maxMultiplier: options.maxMultiplier,
            basis: options.basis,
          })
        : PASSED;
    },
  };
}

/**
 * Esfuerzo mensual: cuotas ya vigentes más la cuota estimada de esta solicitud,
 * sobre el ingreso mensual. Es el DTI español y el comprometimento de renda brasileño.
 */
export function debtToIncomeRatio(options: { max: number; severity?: RuleSeverity }): BusinessRule {
  const severity = options.severity ?? 'reject';

  return {
    code: 'DEBT_TO_INCOME_RATIO',
    description: `Esfuerzo mensual máximo del ${Math.round(options.max * 100)} %`,
    requiresBankData: true,
    evaluate: (context) => {
      if (!context.bank) return deferred('bank.monthlyDebtPaymentsMinor');

      const income = context.applicant.monthlyIncomeMinor;
      if (income <= 0) {
        return violated(severity, 'No hay ingreso declarado sobre el que calcular el esfuerzo');
      }

      const commitment = context.bank.monthlyDebtPaymentsMinor + estimatedInstallmentMinor(context);
      const ratio = commitment / income;

      return ratio > options.max
        ? violated(severity, 'El esfuerzo mensual supera el máximo permitido', {
            ratio: round(ratio),
            max: options.max,
            monthlyCommitmentMinor: commitment,
          })
        : PASSED;
    },
  };
}

/** Deuda viva acumulada frente al ingreso mensual. Es el criterio colombiano. */
export function totalDebtToIncomeRatio(options: { max: number; severity?: RuleSeverity }): BusinessRule {
  const severity = options.severity ?? 'reject';

  return {
    code: 'TOTAL_DEBT_TO_INCOME_RATIO',
    description: `Deuda total máxima del ${Math.round(options.max * 100)} % del ingreso mensual`,
    requiresBankData: true,
    evaluate: (context) => {
      if (!context.bank) return deferred('bank.totalDebtMinor');

      const income = context.applicant.monthlyIncomeMinor;
      if (income <= 0) {
        return violated(severity, 'No hay ingreso declarado sobre el que calcular la deuda');
      }

      const ratio = context.bank.totalDebtMinor / income;

      return ratio > options.max
        ? violated(severity, 'La deuda total supera el máximo sobre el ingreso', {
            ratio: round(ratio),
            max: options.max,
            totalDebtMinor: context.bank.totalDebtMinor,
          })
        : PASSED;
    },
  };
}

/** Score ya normalizado a 0–1000 por el mapper del proveedor. */
export function minimumCreditScore(options: { min: number; severity?: RuleSeverity }): BusinessRule {
  const severity = options.severity ?? 'reject';

  return {
    code: 'MINIMUM_CREDIT_SCORE',
    description: `Score mínimo de ${options.min} sobre 1000`,
    requiresBankData: true,
    evaluate: (context) => {
      if (!context.bank) return deferred('bank.creditScore');

      return context.bank.creditScore < options.min
        ? violated(severity, 'El score crediticio no alcanza el mínimo', {
            creditScore: context.bank.creditScore,
            min: options.min,
          })
        : PASSED;
    },
  };
}

export function maximumDelinquencies(options: { max: number; severity?: RuleSeverity }): BusinessRule {
  const severity = options.severity ?? 'reject';

  return {
    code: 'MAXIMUM_DELINQUENCIES',
    description: `Hasta ${options.max} impagos registrados`,
    requiresBankData: true,
    evaluate: (context) => {
      if (!context.bank) return deferred('bank.delinquencies');

      return context.bank.delinquencies > options.max
        ? violated(severity, 'El solicitante acumula demasiados impagos', {
            delinquencies: context.bank.delinquencies,
            max: options.max,
          })
        : PASSED;
    },
  };
}

/**
 * Por encima del umbral la solicitud no se rechaza: se manda al estado de revisión
 * que el país haya declarado en su StatusFlowOverride.
 */
export function amountReviewThreshold(options: { thresholdMinor: number }): BusinessRule {
  return {
    code: 'AMOUNT_REVIEW_THRESHOLD',
    description: `Revisión adicional por encima de ${options.thresholdMinor}`,
    requiresBankData: false,
    evaluate: (context) =>
      context.requestedAmountMinor > options.thresholdMinor
        ? violated('review', 'El importe exige revisión adicional', {
            requestedAmountMinor: context.requestedAmountMinor,
            thresholdMinor: options.thresholdMinor,
          })
        : PASSED,
  };
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
