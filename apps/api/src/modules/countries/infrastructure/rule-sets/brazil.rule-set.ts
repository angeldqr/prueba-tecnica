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
  minimumCreditScore,
  minimumMonthlyIncome,
  termWithinLimits,
  type BusinessRule,
  type CountryLimits,
  type CountryRuleSet,
  type StatusFlowOverride,
} from '../../domain';

@Injectable()
export class BrazilRuleSet implements CountryRuleSet {
  readonly country = 'BR' as const;
  readonly documentType = DOCUMENT_TYPE_BY_COUNTRY.BR;

  readonly limits: CountryLimits = {
    minAmountMinor: 100_000, // 1.000 BRL
    maxAmountMinor: 10_000_000, // 100.000 BRL
    minTermMonths: 6,
    maxTermMonths: 72,
    minAge: 18,
    maxAge: 75,
    currency: 'BRL',
  };

  /** Lo que aquí se revisa a mano pasa antes por cumplimiento, no por riesgo. */
  readonly statusFlow: StatusFlowOverride = {
    reviewState: 'COMPLIANCE_REVIEW',
    additionalStates: ['COMPLIANCE_REVIEW'],
  };

  readonly rules: readonly BusinessRule[] = [
    amountWithinLimits(this.limits),
    termWithinLimits(this.limits),
    ageWithinLimits(this.limits),
    minimumMonthlyIncome({ minMinor: 151_200 }), // 1.512 BRL
    // Serasa ya puntúa de 0 a 1000, así que la escala común no lo transforma.
    minimumCreditScore({ min: 500 }),
    debtToIncomeRatio({ max: 0.3 }),
  ];

  validateDocument(raw: string): DocumentValidationResult {
    return validateDocumentFor(this.country, raw);
  }
}
