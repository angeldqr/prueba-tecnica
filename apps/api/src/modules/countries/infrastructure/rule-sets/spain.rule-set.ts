import { Injectable } from '@nestjs/common';
import {
  DOCUMENT_TYPE_BY_COUNTRY,
  validateDocumentFor,
  type DocumentValidationResult,
} from '@bravo/contracts';
import {
  amountReviewThreshold,
  amountWithinLimits,
  ageWithinLimits,
  debtToIncomeRatio,
  maximumDelinquencies,
  minimumMonthlyIncome,
  termWithinLimits,
  type BusinessRule,
  type CountryLimits,
  type CountryRuleSet,
  type StatusFlowOverride,
} from '../../domain';

@Injectable()
export class SpainRuleSet implements CountryRuleSet {
  readonly country = 'ES' as const;
  readonly documentType = DOCUMENT_TYPE_BY_COUNTRY.ES;

  readonly limits: CountryLimits = {
    minAmountMinor: 100_000, // 1.000 €
    maxAmountMinor: 6_000_000, // 60.000 €
    minTermMonths: 12,
    maxTermMonths: 96,
    minAge: 18,
    maxAge: 75,
    currency: 'EUR',
  };

  /** Los importes altos no se rechazan: pasan por una revisión adicional propia. */
  readonly statusFlow: StatusFlowOverride = {
    reviewState: 'ADDITIONAL_REVIEW',
    additionalStates: ['ADDITIONAL_REVIEW'],
  };

  readonly rules: readonly BusinessRule[] = [
    amountWithinLimits(this.limits),
    termWithinLimits(this.limits),
    ageWithinLimits(this.limits),
    minimumMonthlyIncome({ minMinor: 90_000 }), // 900 €
    amountReviewThreshold({ thresholdMinor: 1_500_000 }), // 15.000 €
    debtToIncomeRatio({ max: 0.35 }),
    maximumDelinquencies({ max: 0 }),
  ];

  validateDocument(raw: string): DocumentValidationResult {
    return validateDocumentFor(this.country, raw);
  }
}
