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
  maximumDelinquencies,
  minimumMonthlyIncome,
  termWithinLimits,
  totalDebtToIncomeRatio,
  DEFAULT_STATUS_FLOW,
  type BusinessRule,
  type CountryLimits,
  type CountryRuleSet,
  type StatusFlowOverride,
} from '../../domain';

@Injectable()
export class ColombiaRuleSet implements CountryRuleSet {
  readonly country = 'CO' as const;
  readonly documentType = DOCUMENT_TYPE_BY_COUNTRY.CO;

  readonly limits: CountryLimits = {
    minAmountMinor: 100_000_000, // 1.000.000 COP
    maxAmountMinor: 8_000_000_000, // 80.000.000 COP
    minTermMonths: 6,
    maxTermMonths: 72,
    minAge: 18,
    maxAge: 70,
    currency: 'COP',
  };

  readonly statusFlow: StatusFlowOverride = DEFAULT_STATUS_FLOW;

  /**
   * Se miran las dos caras del endeudamiento por separado: la capacidad de pago
   * mes a mes y el volumen de deuda viva acumulada. Un solicitante puede ir al día
   * con cuotas cómodas y arrastrar aun así un saldo desproporcionado.
   */
  readonly rules: readonly BusinessRule[] = [
    amountWithinLimits(this.limits),
    termWithinLimits(this.limits),
    ageWithinLimits(this.limits),
    minimumMonthlyIncome({ minMinor: 130_000_000 }), // 1.300.000 COP
    debtToIncomeRatio({ max: 0.4 }),
    totalDebtToIncomeRatio({ max: 12, severity: 'review' }),
    maximumDelinquencies({ max: 0 }),
  ];

  validateDocument(raw: string): DocumentValidationResult {
    return validateDocumentFor(this.country, raw);
  }
}
