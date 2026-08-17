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
import { parseProviderDate } from './parsing';

const PROVIDER = 'serasa-br';

/**
 * Formato de Serasa: importes en centavos y score de 0 a 1000, que ya coincide con
 * la escala común.
 *
 * Trae también `comprometimento_renda` ya calculado, pero se ignora a propósito: no
 * sabemos con qué ingreso lo ha calculado el proveedor, y el esfuerzo mensual lo
 * decide la regla de negocio brasileña con el ingreso que declaró el solicitante.
 */
const responseSchema = z.object({
  cpf: z.string(),
  score_serasa: z.number(),
  comprometimento_renda: z.number().optional(),
  dividas: z.object({
    total_centavos: z.number().int().nonnegative(),
    parcela_mensal_centavos: z.number().int().nonnegative(),
  }),
  negativacoes: z.number().int().nonnegative(),
  contratos_ativos: z.number().int().nonnegative(),
  primeiro_contrato: z.string().nullable(),
});

export type SerasaBrResponse = z.infer<typeof responseSchema>;

export function mapSerasaBr(payload: unknown, fetchedAt: Date): BankSnapshot {
  const parsed = responseSchema.safeParse(payload);

  if (!parsed.success) {
    throw new ProviderContractError(PROVIDER, parsed.error.issues[0]?.message ?? 'formato desconocido');
  }

  const data = parsed.data;

  return {
    provider: PROVIDER,
    country: 'BR',
    fetchedAt,
    currency: 'BRL',
    monthlyDebtPaymentsMinor: data.dividas.parcela_mensal_centavos,
    totalDebtMinor: data.dividas.total_centavos,
    creditScore: rescaleScore(data.score_serasa, { min: 0, max: 1000 }),
    delinquencies: data.negativacoes,
    activeLoans: data.contratos_ativos,
    oldestAccountOpenedAt: data.primeiro_contrato ? parseProviderDate(data.primeiro_contrato) : null,
    raw: payload,
  };
}

@Injectable()
export class SerasaBrAdapter implements BankProviderAdapter {
  readonly country = 'BR' as const;
  readonly providerName = PROVIDER;

  constructor(private readonly http: ProviderHttpClient) {}

  async fetchSnapshot(request: BankSnapshotRequest): Promise<BankSnapshot> {
    const payload = await this.http.post(PROVIDER, '/providers/br/consulta-serasa', {
      cpf: request.document,
    });

    return mapSerasaBr(payload, new Date());
  }
}
