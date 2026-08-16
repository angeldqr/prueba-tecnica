import { Inject, Injectable } from '@nestjs/common';
import type { CountryCode, DocumentValidationResult, ReviewStatus } from '@bravo/contracts';
import { ValidationError } from '../../../shared/domain';
import {
  COUNTRY_REGISTRY,
  evaluateRules,
  type CountryRegistry,
  type RuleContext,
  type RuleEvaluation,
} from '../domain';
import { toCountryCatalogDto, type CountryCatalogDto } from './dto/country-catalog.dto';

/**
 * Punto de entrada al módulo de países. El resto del sistema pasa por aquí y nunca
 * toca un ruleset concreto, que es lo que permite añadir un país sin cambiar nada más.
 */
@Injectable()
export class CountryRulesService {
  constructor(
    @Inject(COUNTRY_REGISTRY)
    private readonly registry: CountryRegistry,
  ) {}

  evaluate(context: RuleContext): RuleEvaluation {
    const ruleSet = this.registry.get(context.country);

    if (context.currency !== ruleSet.limits.currency) {
      throw new ValidationError('La moneda no corresponde al país de la solicitud', {
        country: context.country,
        received: context.currency,
        expected: ruleSet.limits.currency,
      });
    }

    return evaluateRules(context.country, ruleSet.rules, context);
  }

  validateDocument(country: CountryCode, raw: string): DocumentValidationResult {
    return this.registry.get(country).validateDocument(raw);
  }

  /** Estado de revisión al que deriva este país cuando la evaluación resuelve REVIEW. */
  reviewStateFor(country: CountryCode): ReviewStatus {
    return this.registry.get(country).statusFlow.reviewState;
  }

  catalog(): readonly CountryCatalogDto[] {
    return this.registry.all().map(toCountryCatalogDto);
  }

  describe(country: CountryCode): CountryCatalogDto {
    return toCountryCatalogDto(this.registry.get(country));
  }
}
