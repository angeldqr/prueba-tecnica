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
  minimumCreditScore,
  minimumMonthlyIncome,
  termWithinLimits,
  DEFAULT_STATUS_FLOW,
  type BusinessRule,
  type CountryLimits,
  type CountryRuleSet,
  type StatusFlowOverride,
} from '../../domain';

@Injectable()
export class MexicoRuleSet implements CountryRuleSet {
  readonly country = 'MX' as const;
  readonly documentType = DOCUMENT_TYPE_BY_COUNTRY.MX;

  readonly limits: CountryLimits = {
    minAmountMinor: 500_000, // 5.000 MXN
    maxAmountMinor: 50_000_000, // 500.000 MXN
    minTermMonths: 6,
    maxTermMonths: 60,
    minAge: 18,
    maxAge: 70,
    currency: 'MXN',
  };

  readonly statusFlow: StatusFlowOverride = DEFAULT_STATUS_FLOW;

  readonly rules: readonly BusinessRule[] = [
    amountWithinLimits(this.limits),
    termWithinLimits(this.limits),
    ageWithinLimits(this.limits),
    minimumMonthlyIncome({ minMinor: 800_000 }), // 8.000 MXN
    amountToIncomeRatio({ maxMultiplier: 6, basis: 'monthly' }),
    // El Buró puntúa de 400 a 850; el mapper lo lleva a la escala común de 0 a 1000.
    minimumCreditScore({ min: 550 }),
    debtToIncomeRatio({ max: 0.45 }),
  ];

  validateDocument(raw: string): DocumentValidationResult {
    return validateDocumentFor(this.country, raw);
  }
}
