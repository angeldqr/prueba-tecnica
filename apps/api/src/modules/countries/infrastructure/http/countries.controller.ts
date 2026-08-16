import { Controller, Get, Param } from '@nestjs/common';
import type { CountryCode } from '@bravo/contracts';
import { ParseCountryPipe } from '../../../../shared/http';
import { CountryRulesService } from '../../application/country-rules.service';
import type { CountryCatalogDto } from '../../application/dto/country-catalog.dto';

@Controller('countries')
export class CountriesController {
  constructor(private readonly countryRules: CountryRulesService) {}

  @Get()
  list(): readonly CountryCatalogDto[] {
    return this.countryRules.catalog();
  }

  @Get(':code')
  describe(@Param('code', ParseCountryPipe) code: CountryCode): CountryCatalogDto {
    return this.countryRules.describe(code);
  }
}
