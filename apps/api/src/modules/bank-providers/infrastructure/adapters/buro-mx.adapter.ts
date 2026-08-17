import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  ProviderContractError,
  rescaleScore,
  type BankProviderAdapter,
  type BankSnapshot,
  type BankSnapshotRequest,
} from '../../domain';
import { ProviderHttpClient } from '../http/provider-http.client';
import { dateFromMonthsAgo, decimalToMinor } from './parsing';

const PROVIDER = 'buro-mx';

/**
 * Formato del Buró de Crédito: score de 400 a 850 e importes en pesos con decimales.
 * En vez de la fecha del crédito más antiguo da su antigüedad en meses, así que la
 * fecha hay que derivarla.
 */
const responseSchema = z.object({
  folioConsulta: z.string(),
  scoreBuro: z.number(),
  resumen: z.object({
    saldoTotalMxn: z.number().nonnegative(),
    pagoMensualMxn: z.number().nonnegative(),
    creditosAbiertos: z.number().int().nonnegative(),
    atrasosUltimos24Meses: z.number().int().nonnegative(),
    antiguedadMeses: z.number().int().nonnegative().nullable(),
  }),
});

export type BuroMxResponse = z.infer<typeof responseSchema>;

export function mapBuroMx(payload: unknown, fetchedAt: Date): BankSnapshot {
  const parsed = responseSchema.safeParse(payload);

  if (!parsed.success) {
    throw new ProviderContractError(PROVIDER, parsed.error.issues[0]?.message ?? 'formato desconocido');
  }

  const { resumen } = parsed.data;

  return {
    provider: PROVIDER,
    country: 'MX',
    fetchedAt,
    currency: 'MXN',
    monthlyDebtPaymentsMinor: decimalToMinor(resumen.pagoMensualMxn),
    totalDebtMinor: decimalToMinor(resumen.saldoTotalMxn),
    creditScore: rescaleScore(parsed.data.scoreBuro, { min: 400, max: 850 }),
    delinquencies: resumen.atrasosUltimos24Meses,
    activeLoans: resumen.creditosAbiertos,
    oldestAccountOpenedAt:
      resumen.antiguedadMeses === null ? null : dateFromMonthsAgo(resumen.antiguedadMeses, fetchedAt),
    raw: payload,
  };
}

@Injectable()
export class BuroMxAdapter implements BankProviderAdapter {
  readonly country = 'MX' as const;
  readonly providerName = PROVIDER;

  constructor(private readonly http: ProviderHttpClient) {}

  async fetchSnapshot(request: BankSnapshotRequest): Promise<BankSnapshot> {
    const payload = await this.http.post(PROVIDER, '/providers/mx/reporte-credito', {
      curp: request.document,
    });

    return mapBuroMx(payload, new Date());
  }
}
