import type { CountryCode, DocumentType, DocumentValidationResult } from '@bravo/contracts';
import type { BusinessRule } from './business-rule';
import type { CountryLimits } from './country-limits';
import type { StatusFlowOverride } from './status-flow';

/**
 * Todo lo que el sistema necesita saber de un país. Dar de alta uno nuevo es
 * implementar esta interfaz y registrarla; ningún otro fichero se entera.
 */
export interface CountryRuleSet {
  readonly country: CountryCode;
  readonly documentType: DocumentType;
  readonly limits: CountryLimits;
  readonly rules: readonly BusinessRule[];
  readonly statusFlow: StatusFlowOverride;
  validateDocument(raw: string): DocumentValidationResult;
}

/** Token del array de rulesets. Nest no tiene providers `multi`, así que se compone a mano. */
export const COUNTRY_RULE_SETS = Symbol('COUNTRY_RULE_SETS');

export const COUNTRY_REGISTRY = Symbol('COUNTRY_REGISTRY');

export interface CountryRegistry {
  /** Lanza NotFoundError si el país no está dado de alta. */
  get(country: CountryCode): CountryRuleSet;
  all(): readonly CountryRuleSet[];
  supportedCountries(): readonly CountryCode[];
}
