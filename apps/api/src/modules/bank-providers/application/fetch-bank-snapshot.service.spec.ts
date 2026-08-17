import type { CountryCode } from '@bravo/contracts';
import type { PinoLogger } from 'nestjs-pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CircuitOpenError,
  ProviderRejectedError,
  ProviderUnavailableError,
  type BankProviderAdapter,
  type BankProviderPolicy,
  type BankProviderRegistry,
  type BankSnapshot,
} from '../domain';
import { FetchBankSnapshotService } from './fetch-bank-snapshot.service';

const SNAPSHOT: BankSnapshot = {
  provider: 'proveedor-de-prueba',
  country: 'ES',
  fetchedAt: new Date('2026-08-16T12:00:00Z'),
  currency: 'EUR',
  monthlyDebtPaymentsMinor: 20_000,
  totalDebtMinor: 300_000,
  creditScore: 750,
  delinquencies: 0,
  activeLoans: 1,
  oldestAccountOpenedAt: null,
  raw: {},
};

/** Sin esperas reales ni jitter: los tests miden decisiones, no el reloj. */
const POLICY: BankProviderPolicy = {
  retry: { attempts: 3, baseDelayMs: 1, maxDelayMs: 1, sleep: async () => undefined, random: () => 0 },
  breaker: { failureThreshold: 3, successThreshold: 1, openMs: 30_000 },
};

const logger = {
  setContext: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
} as unknown as PinoLogger;

function servicioCon(fetchSnapshot: BankProviderAdapter['fetchSnapshot']) {
  const adapter: BankProviderAdapter = {
    country: 'ES',
    providerName: 'proveedor-de-prueba',
    fetchSnapshot,
  };

  const registry: BankProviderRegistry = {
    get: (country: CountryCode) => {
      if (country !== 'ES') throw new Error(`sin proveedor para ${country}`);
      return adapter;
    },
    all: () => [adapter],
  };

  return new FetchBankSnapshotService(registry, POLICY, logger);
}

describe('FetchBankSnapshotService', () => {
  beforeEach(() => vi.clearAllMocks());

  it('devuelve el snapshot cuando el proveedor responde', async () => {
    const service = servicioCon(vi.fn().mockResolvedValue(SNAPSHOT));

    await expect(service.fetch('ES', '12345678Z')).resolves.toEqual(SNAPSHOT);
  });

  it('pasa el país y el documento al adaptador', async () => {
    const fetchSnapshot = vi.fn().mockResolvedValue(SNAPSHOT);
    await servicioCon(fetchSnapshot).fetch('ES', '12345678Z');

    expect(fetchSnapshot).toHaveBeenCalledWith({ country: 'ES', document: '12345678Z' });
  });

  it('reintenta un fallo pasajero y se recupera', async () => {
    const fetchSnapshot = vi
      .fn()
      .mockRejectedValueOnce(new ProviderUnavailableError('p', '503'))
      .mockResolvedValue(SNAPSHOT);

    const service = servicioCon(fetchSnapshot);

    await expect(service.fetch('ES', '12345678Z')).resolves.toEqual(SNAPSHOT);
    expect(fetchSnapshot).toHaveBeenCalledTimes(2);
  });

  it('no reintenta un rechazo del proveedor', async () => {
    const fetchSnapshot = vi.fn().mockRejectedValue(new ProviderRejectedError('p', 400));
    const service = servicioCon(fetchSnapshot);

    await expect(service.fetch('ES', '12345678Z')).rejects.toThrow(ProviderRejectedError);
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
  });

  it('abre el circuito tras los fallos pasajeros que marca la política', async () => {
    const fetchSnapshot = vi.fn().mockRejectedValue(new ProviderUnavailableError('p', '503'));
    const service = servicioCon(fetchSnapshot);

    for (let i = 0; i < 3; i += 1) {
      await expect(service.fetch('ES', '12345678Z')).rejects.toThrow(ProviderUnavailableError);
    }

    expect(service.circuitStates()['proveedor-de-prueba']).toBe('open');
  });

  it('con el circuito abierto corta antes de salir a la red', async () => {
    const fetchSnapshot = vi.fn().mockRejectedValue(new ProviderUnavailableError('p', '503'));
    const service = servicioCon(fetchSnapshot);

    for (let i = 0; i < 3; i += 1) {
      await expect(service.fetch('ES', '12345678Z')).rejects.toThrow();
    }

    const llamadasAntes = fetchSnapshot.mock.calls.length;

    await expect(service.fetch('ES', '12345678Z')).rejects.toThrow(CircuitOpenError);
    expect(fetchSnapshot.mock.calls.length).toBe(llamadasAntes);
  });

  it('los rechazos no abren el circuito: no dicen nada del estado del proveedor', async () => {
    const fetchSnapshot = vi.fn().mockRejectedValue(new ProviderRejectedError('p', 400));
    const service = servicioCon(fetchSnapshot);

    for (let i = 0; i < 10; i += 1) {
      await expect(service.fetch('ES', '12345678Z')).rejects.toThrow(ProviderRejectedError);
    }

    expect(service.circuitStates()['proveedor-de-prueba']).toBe('closed');
  });

  it('un éxito intercalado impide que se acumulen los fallos', async () => {
    const fetchSnapshot = vi
      .fn()
      .mockRejectedValueOnce(new ProviderUnavailableError('p', '503'))
      .mockRejectedValueOnce(new ProviderUnavailableError('p', '503'))
      .mockRejectedValueOnce(new ProviderUnavailableError('p', '503'))
      .mockResolvedValueOnce(SNAPSHOT);

    const service = servicioCon(fetchSnapshot);

    // Con tres intentos por llamada, la primera agota el reintento y falla una vez
    // de cara al circuito; la segunda entra directa al éxito.
    await expect(service.fetch('ES', '12345678Z')).rejects.toThrow();
    await expect(service.fetch('ES', '12345678Z')).resolves.toEqual(SNAPSHOT);

    expect(service.circuitStates()['proveedor-de-prueba']).toBe('closed');
  });

  it('informa del estado del circuito de cada proveedor', () => {
    const service = servicioCon(vi.fn().mockResolvedValue(SNAPSHOT));

    expect(service.circuitStates()).toEqual({ 'proveedor-de-prueba': 'closed' });
  });
});
