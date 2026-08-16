import { Module } from '@nestjs/common';
import { CountryRulesService } from './application/country-rules.service';
import { COUNTRY_REGISTRY, COUNTRY_RULE_SETS, type CountryRuleSet } from './domain';
import { CountryRegistryService } from './infrastructure/country-registry.service';
import { CountriesController } from './infrastructure/http/countries.controller';
import {
  BrazilRuleSet,
  ColombiaRuleSet,
  ItalyRuleSet,
  MexicoRuleSet,
  PortugalRuleSet,
  SpainRuleSet,
} from './infrastructure/rule-sets';

/**
 * Única lista que hay que tocar para dar de alta un país: se añade la clase aquí y
 * el registry la recoge. Si falta alguno de los declarados en COUNTRY_CODES, la
 * aplicación no arranca.
 */
const RULE_SETS = [
  SpainRuleSet,
  PortugalRuleSet,
  ItalyRuleSet,
  MexicoRuleSet,
  ColombiaRuleSet,
  BrazilRuleSet,
] as const;

@Module({
  controllers: [CountriesController],
  providers: [
    ...RULE_SETS,
    {
      // Nest no tiene providers `multi`, así que el array se compone inyectando
      // cada ruleset y devolviéndolos tal cual.
      provide: COUNTRY_RULE_SETS,
      useFactory: (...ruleSets: CountryRuleSet[]) => ruleSets,
      inject: [...RULE_SETS],
    },
    { provide: COUNTRY_REGISTRY, useClass: CountryRegistryService },
    CountryRulesService,
  ],
  exports: [CountryRulesService, COUNTRY_REGISTRY],
})
export class CountriesModule {}
