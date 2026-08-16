import { Inject, Injectable } from '@nestjs/common';
import { COUNTRY_CODES, type CountryCode } from '@bravo/contracts';
import { NotFoundError } from '../../../shared/domain';
import { COUNTRY_RULE_SETS, type CountryRegistry, type CountryRuleSet } from '../domain/country-rule-set';

@Injectable()
export class CountryRegistryService implements CountryRegistry {
  private readonly byCountry: ReadonlyMap<CountryCode, CountryRuleSet>;

  constructor(@Inject(COUNTRY_RULE_SETS) ruleSets: readonly CountryRuleSet[]) {
    const index = new Map<CountryCode, CountryRuleSet>();

    for (const ruleSet of ruleSets) {
      if (index.has(ruleSet.country)) {
        throw new Error(`Hay dos rulesets registrados para ${ruleSet.country}`);
      }
      index.set(ruleSet.country, ruleSet);
    }

    // Un país declarado en COUNTRY_CODES sin ruleset devolvería un 500 en la primera
    // solicitud que lo usara. Preferimos que el arranque se caiga y se vea al desplegar.
    const missing = COUNTRY_CODES.filter((country) => !index.has(country));
    if (missing.length > 0) {
      throw new Error(`Faltan los rulesets de: ${missing.join(', ')}`);
    }

    this.byCountry = index;
  }

  get(country: CountryCode): CountryRuleSet {
    const ruleSet = this.byCountry.get(country);
    if (!ruleSet) throw new NotFoundError('País', country);

    return ruleSet;
  }

  all(): readonly CountryRuleSet[] {
    return [...this.byCountry.values()];
  }

  supportedCountries(): readonly CountryCode[] {
    return [...this.byCountry.keys()];
  }
}
