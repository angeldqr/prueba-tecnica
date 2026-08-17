import { Inject, Injectable } from '@nestjs/common';
import { COUNTRY_CODES, type CountryCode } from '@bravo/contracts';
import { NotFoundError } from '../../../shared/domain';
import { BANK_PROVIDER_ADAPTERS, type BankProviderAdapter, type BankProviderRegistry } from '../domain';

@Injectable()
export class BankProviderRegistryService implements BankProviderRegistry {
  private readonly byCountry: ReadonlyMap<CountryCode, BankProviderAdapter>;

  constructor(@Inject(BANK_PROVIDER_ADAPTERS) adapters: readonly BankProviderAdapter[]) {
    const index = new Map<CountryCode, BankProviderAdapter>();

    for (const adapter of adapters) {
      if (index.has(adapter.country)) {
        throw new Error(`Hay dos proveedores registrados para ${adapter.country}`);
      }
      index.set(adapter.country, adapter);
    }

    const missing = COUNTRY_CODES.filter((country) => !index.has(country));
    if (missing.length > 0) {
      throw new Error(`Faltan los proveedores bancarios de: ${missing.join(', ')}`);
    }

    this.byCountry = index;
  }

  get(country: CountryCode): BankProviderAdapter {
    const adapter = this.byCountry.get(country);
    if (!adapter) throw new NotFoundError('Proveedor bancario', country);

    return adapter;
  }

  all(): readonly BankProviderAdapter[] {
    return [...this.byCountry.values()];
  }
}
