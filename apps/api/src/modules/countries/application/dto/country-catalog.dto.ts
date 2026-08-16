import { COUNTRY_NAMES, type CountryCode, type DocumentType, type ReviewStatus } from '@bravo/contracts';
import type { CountryLimits, CountryRuleSet } from '../../domain';

export interface RuleSummaryDto {
  readonly code: string;
  readonly description: string;
  readonly requiresBankData: boolean;
}

/**
 * Lo que el frontend necesita para montar el formulario de un país: etiquetas,
 * rangos y qué reglas se le van a aplicar. Las reglas se exponen por código y
 * descripción, nunca la función que las evalúa.
 */
export interface CountryCatalogDto {
  readonly code: CountryCode;
  readonly name: string;
  readonly currency: string;
  readonly documentType: DocumentType;
  readonly limits: CountryLimits;
  readonly reviewState: ReviewStatus;
  readonly rules: readonly RuleSummaryDto[];
}

export function toCountryCatalogDto(ruleSet: CountryRuleSet): CountryCatalogDto {
  return {
    code: ruleSet.country,
    name: COUNTRY_NAMES[ruleSet.country],
    currency: ruleSet.limits.currency,
    documentType: ruleSet.documentType,
    limits: ruleSet.limits,
    reviewState: ruleSet.statusFlow.reviewState,
    rules: ruleSet.rules.map((rule) => ({
      code: rule.code,
      description: rule.description,
      requiresBankData: rule.requiresBankData,
    })),
  };
}
