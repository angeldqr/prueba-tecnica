import type { CountryCode } from '@bravo/contracts';
import type { BankSnapshot, BankSnapshotRequest } from './bank-snapshot';

/**
 * Lo único que el resto del sistema sabe de un proveedor bancario. Añadir un país
 * es implementar esto y registrarlo; nadie más se entera de que existe SIBS,
 * DataCrédito o Serasa.
 */
export interface BankProviderAdapter {
  readonly country: CountryCode;
  readonly providerName: string;
  fetchSnapshot(request: BankSnapshotRequest): Promise<BankSnapshot>;
}

export const BANK_PROVIDER_ADAPTERS = Symbol('BANK_PROVIDER_ADAPTERS');

export const BANK_PROVIDER_REGISTRY = Symbol('BANK_PROVIDER_REGISTRY');

export interface BankProviderRegistry {
  /** Lanza NotFoundError si el país no tiene proveedor dado de alta. */
  get(country: CountryCode): BankProviderAdapter;
  all(): readonly BankProviderAdapter[];
}
