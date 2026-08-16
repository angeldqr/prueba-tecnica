import { Injectable } from '@nestjs/common';
import {
  DOCUMENT_TYPE_BY_COUNTRY,
  validateDocumentFor,
  type DocumentValidationResult,
} from '@bravo/contracts';
import {
  amountWithinLimits,
  ageWithinLimits,
  debtToIncomeRatio,
  minimumEmployment,
  minimumMonthlyIncome,
  termWithinLimits,
  DEFAULT_STATUS_FLOW,
  type BusinessRule,
  type CountryLimits,
  type CountryRuleSet,
  type StatusFlowOverride,
} from '../../domain';

@Injectable()
export class ItalyRuleSet implements CountryRuleSet {
  readonly country = 'IT' as const;
  readonly documentType = DOCUMENT_TYPE_BY_COUNTRY.IT;

  readonly limits: CountryLimits = {
    minAmountMinor: 100_000, // 1.000 €
    maxAmountMinor: 7_500_000, // 75.000 €
    minTermMonths: 12,
    maxTermMonths: 120,
    minAge: 18,
    maxAge: 75,
    currency: 'EUR',
  };

  readonly statusFlow: StatusFlowOverride = DEFAULT_STATUS_FLOW;

  /**
   * El criterio italiano gira en torno a la estabilidad: un ingreso suficiente y
   * sostenido pesa más que el importe pedido, que aquí admite plazos largos.
   */
  readonly rules: readonly BusinessRule[] = [
    amountWithinLimits(this.limits),
    termWithinLimits(this.limits),
    ageWithinLimits(this.limits),
    minimumMonthlyIncome({ minMinor: 80_000 }), // 800 €
    minimumEmployment({ months: 12, severity: 'review' }),
    debtToIncomeRatio({ max: 0.4 }),
  ];

  validateDocument(raw: string): DocumentValidationResult {
    return validateDocumentFor(this.country, raw);
  }
}
