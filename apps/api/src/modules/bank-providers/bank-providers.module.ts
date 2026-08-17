import { Module } from '@nestjs/common';
import { FetchBankSnapshotService } from './application/fetch-bank-snapshot.service';
import {
  BANK_PROVIDER_ADAPTERS,
  BANK_PROVIDER_POLICY,
  BANK_PROVIDER_REGISTRY,
  DEFAULT_PROVIDER_POLICY,
  type BankProviderAdapter,
} from './domain';
import { BankProviderRegistryService } from './infrastructure/bank-provider-registry.service';
import {
  BuroMxAdapter,
  CbiGlobeItAdapter,
  DataCreditoCoAdapter,
  OpenBankingEsAdapter,
  SerasaBrAdapter,
  SibsPtAdapter,
} from './infrastructure/adapters';
import { ProviderHttpClient } from './infrastructure/http/provider-http.client';

/**
 * Igual que con los países: una lista, y el registro comprueba al arrancar que no
 * falta ninguno de los declarados en COUNTRY_CODES.
 */
const ADAPTERS = [
  OpenBankingEsAdapter,
  SibsPtAdapter,
  CbiGlobeItAdapter,
  BuroMxAdapter,
  DataCreditoCoAdapter,
  SerasaBrAdapter,
] as const;

@Module({
  providers: [
    ProviderHttpClient,
    ...ADAPTERS,
    {
      provide: BANK_PROVIDER_ADAPTERS,
      useFactory: (...adapters: BankProviderAdapter[]) => adapters,
      inject: [...ADAPTERS],
    },
    { provide: BANK_PROVIDER_REGISTRY, useClass: BankProviderRegistryService },
    { provide: BANK_PROVIDER_POLICY, useValue: DEFAULT_PROVIDER_POLICY },
    FetchBankSnapshotService,
  ],
  exports: [FetchBankSnapshotService, BANK_PROVIDER_REGISTRY],
})
export class BankProvidersModule {}
