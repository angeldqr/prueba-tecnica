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
import { decimalToMinor, parseProviderDate } from './parsing';

const PROVIDER = 'sibs-pt';

/**
 * Formato de SIBS: snake_case y los importes como decimales en texto. Mandarlos como
 * cadena es lo correcto por su parte —así no los redondea ningún parser de JSON—,
 * pero obliga a convertirlos sin pasar por coma flotante.
 */
const responseSchema = z.object({
  nif: z.string(),
  moeda: z.literal('EUR'),
  score_credito: z.string(),
  divida_total: z.string(),
  prestacao_mensal: z.string(),
  creditos_ativos: z.number().int().nonnegative(),
  incidentes: z.number().int().nonnegative(),
  primeiro_credito: z.string().nullable(),
});

export type SibsPtResponse = z.infer<typeof responseSchema>;

export function mapSibsPt(payload: unknown, fetchedAt: Date): BankSnapshot {
  const parsed = responseSchema.safeParse(payload);

  if (!parsed.success) {
    throw new ProviderContractError(PROVIDER, parsed.error.issues[0]?.message ?? 'formato desconocido');
  }

  const data = parsed.data;
  const score = Number(data.score_credito);

  if (!Number.isFinite(score)) {
    throw new ProviderContractError(PROVIDER, `score_credito no es numérico: ${data.score_credito}`);
  }

  return {
    provider: PROVIDER,
    country: 'PT',
    fetchedAt,
    currency: 'EUR',
    monthlyDebtPaymentsMinor: decimalToMinor(data.prestacao_mensal),
    totalDebtMinor: decimalToMinor(data.divida_total),
    // SIBS puntúa de 0 a 100.
    creditScore: rescaleScore(score, { min: 0, max: 100 }),
    delinquencies: data.incidentes,
    activeLoans: data.creditos_ativos,
    oldestAccountOpenedAt: data.primeiro_credito ? parseProviderDate(data.primeiro_credito) : null,
    raw: payload,
  };
}

@Injectable()
export class SibsPtAdapter implements BankProviderAdapter {
  readonly country = 'PT' as const;
  readonly providerName = PROVIDER;

  constructor(private readonly http: ProviderHttpClient) {}

  async fetchSnapshot(request: BankSnapshotRequest): Promise<BankSnapshot> {
    const payload = await this.http.post(PROVIDER, '/providers/pt/consulta-credito', {
      nif: request.document,
    });

    return mapSibsPt(payload, new Date());
  }
}
