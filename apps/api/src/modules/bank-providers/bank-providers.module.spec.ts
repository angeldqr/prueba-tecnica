import { Global, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { COUNTRY_CODES, type CountryCode } from '@bravo/contracts';
import { PinoLogger } from 'nestjs-pino';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../../shared/domain';
import { TypedConfigService } from '../../shared/infrastructure/config';
import { BankProvidersModule } from './bank-providers.module';
import { BANK_PROVIDER_REGISTRY, type BankProviderRegistry } from './domain';

/**
 * Sustituye a la configuración y al logger reales.
 *
 * Importar AppConfigModule aquí obligaría a que existiera un .env válido para poder
 * ejecutar los tests, y en CI no lo hay ni debe haberlo: comprobar el cableado de un
 * módulo no necesita credenciales de nada.
 */
@Global()
@Module({
  providers: [
    {
      provide: TypedConfigService,
      useValue: {
        get: (key: string) =>
          ({
            BANK_PROVIDER_BASE_URL: 'http://localhost:3002',
            BANK_PROVIDER_TIMEOUT_MS: 1_000,
          })[key],
      },
    },
    {
      provide: PinoLogger,
      useValue: { setContext: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    },
  ],
  exports: [TypedConfigService, PinoLogger],
})
class TestInfraModule {}

describe('BankProvidersModule', () => {
  let registry: BankProviderRegistry;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TestInfraModule, BankProvidersModule],
    }).compile();

    registry = moduleRef.get<BankProviderRegistry>(BANK_PROVIDER_REGISTRY);
  });

  it('hay un proveedor por cada país soportado', () => {
    expect(registry.all()).toHaveLength(COUNTRY_CODES.length);
  });

  it('cada proveedor responde por su propio país', () => {
    for (const country of COUNTRY_CODES) {
      expect(registry.get(country).country).toBe(country);
    }
  });

  it('los nombres de proveedor no se repiten', () => {
    const nombres = registry.all().map((adapter) => adapter.providerName);

    expect(new Set(nombres).size).toBe(nombres.length);
  });

  it('un país sin proveedor no se resuelve', () => {
    expect(() => registry.get('FR' as CountryCode)).toThrow(NotFoundError);
  });
});
