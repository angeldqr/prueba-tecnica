import { Injectable } from '@nestjs/common';
import {
  DOCUMENT_TYPE_BY_COUNTRY,
  validateDocumentFor,
  type DocumentValidationResult,
} from '@bravo/contracts';
import {
  amountToIncomeRatio,
  amountWithinLimits,
  ageWithinLimits,
  debtToIncomeRatio,
  maximumDelinquencies,
  minimumMonthlyIncome,
  termWithinLimits,
  DEFAULT_STATUS_FLOW,
  type BusinessRule,
  type CountryLimits,
  type CountryRuleSet,
  type StatusFlowOverride,
} from '../../domain';

@Injectable()
export class PortugalRuleSet implements CountryRuleSet {
  readonly country = 'PT' as const;
  readonly documentType = DOCUMENT_TYPE_BY_COUNTRY.PT;

  readonly limits: CountryLimits = {
    minAmountMinor: 50_000, // 500 €
    maxAmountMinor: 5_000_000, // 50.000 €
    minTermMonths: 6,
    maxTermMonths: 84,
    minAge: 18,
    maxAge: 70,
    currency: 'EUR',
  };

  readonly statusFlow: StatusFlowOverride = DEFAULT_STATUS_FLOW;

  readonly rules: readonly BusinessRule[] = [
    amountWithinLimits(this.limits),
    termWithinLimits(this.limits),
    ageWithinLimits(this.limits),
    minimumMonthlyIncome({ minMinor: 82_000 }), // 820 €
    amountToIncomeRatio({ maxMultiplier: 8, basis: 'annual' }),
    debtToIncomeRatio({ max: 0.4 }),
    maximumDelinquencies({ max: 1, severity: 'review' }),
  ];

  validateDocument(raw: string): DocumentValidationResult {
    return validateDocumentFor(this.country, raw);
  }
}
