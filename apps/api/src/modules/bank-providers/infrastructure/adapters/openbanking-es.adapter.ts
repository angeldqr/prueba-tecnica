import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  ProviderContractError,
  scoreFromGrade,
  type BankProviderAdapter,
  type BankSnapshot,
  type BankSnapshotRequest,
} from '../../domain';
import { ProviderHttpClient } from '../http/provider-http.client';
import { parseProviderDate } from './parsing';

const PROVIDER = 'openbanking-es';

/** De mejor a peor; scoreFromGrade reparte el rango a partir del orden. */
const RISK_GRADES = ['A', 'B', 'C', 'D', 'E'] as const;

/**
 * Formato de OpenBanking ES: camelCase y los importes en céntimos como entero, que
 * es lo más cómodo de los seis porque ya coincide con la representación interna.
 */
const responseSchema = z.object({
  subjectId: z.string(),
  currency: z.literal('EUR'),
  riskGrade: z.enum(RISK_GRADES),
  accountsSummary: z.object({
    totalOutstandingCents: z.number().int().nonnegative(),
    monthlyInstalmentsCents: z.number().int().nonnegative(),
    activeCreditCount: z.number().int().nonnegative(),
    missedPaymentsLast24m: z.number().int().nonnegative(),
    oldestAccountOpened: z.string().nullable(),
  }),
});

export type OpenBankingEsResponse = z.infer<typeof responseSchema>;

export function mapOpenBankingEs(payload: unknown, fetchedAt: Date): BankSnapshot {
  const parsed = responseSchema.safeParse(payload);

  if (!parsed.success) {
    throw new ProviderContractError(PROVIDER, parsed.error.issues[0]?.message ?? 'formato desconocido');
  }

  const { accountsSummary: summary, riskGrade } = parsed.data;

  return {
    provider: PROVIDER,
    country: 'ES',
    fetchedAt,
    currency: 'EUR',
    monthlyDebtPaymentsMinor: summary.monthlyInstalmentsCents,
    totalDebtMinor: summary.totalOutstandingCents,
    creditScore: scoreFromGrade(riskGrade, RISK_GRADES),
    delinquencies: summary.missedPaymentsLast24m,
    activeLoans: summary.activeCreditCount,
    oldestAccountOpenedAt: summary.oldestAccountOpened
      ? parseProviderDate(summary.oldestAccountOpened)
      : null,
    raw: payload,
  };
}

@Injectable()
export class OpenBankingEsAdapter implements BankProviderAdapter {
  readonly country = 'ES' as const;
  readonly providerName = PROVIDER;

  constructor(private readonly http: ProviderHttpClient) {}

  async fetchSnapshot(request: BankSnapshotRequest): Promise<BankSnapshot> {
    const payload = await this.http.post(PROVIDER, '/providers/es/credit-profile', {
      documentNumber: request.document,
    });

    return mapOpenBankingEs(payload, new Date());
  }
}
