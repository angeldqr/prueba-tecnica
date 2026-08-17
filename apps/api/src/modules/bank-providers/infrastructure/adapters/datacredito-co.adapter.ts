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
import { decimalToMinor, earliest, parseProviderDate } from './parsing';

const PROVIDER = 'datacredito-co';

const ESTADOS = ['AL_DIA', 'MORA', 'CERRADA'] as const;

/**
 * Formato de DataCrédito: no da cifras agregadas, sino el detalle obligación por
 * obligación. La cuota mensual, el número de créditos vivos y los impagos hay que
 * derivarlos aquí; es el caso donde la capa anticorrupción hace más trabajo.
 *
 * Los importes vienen en pesos enteros, sin decimales, y por dentro se manejan en
 * centavos como el resto de monedas.
 */
const responseSchema = z.object({
  numero_documento: z.string(),
  puntaje: z.number(),
  deuda_total_cop: z.number().nonnegative(),
  obligaciones: z.array(
    z.object({
      entidad: z.string(),
      cuota_mensual_cop: z.number().nonnegative(),
      estado: z.enum(ESTADOS),
      fecha_apertura: z.string(),
    }),
  ),
});

export type DataCreditoCoResponse = z.infer<typeof responseSchema>;

export function mapDataCreditoCo(payload: unknown, fetchedAt: Date): BankSnapshot {
  const parsed = responseSchema.safeParse(payload);

  if (!parsed.success) {
    throw new ProviderContractError(PROVIDER, parsed.error.issues[0]?.message ?? 'formato desconocido');
  }

  const data = parsed.data;
  const vivas = data.obligaciones.filter((obligacion) => obligacion.estado !== 'CERRADA');

  const cuotaMensualMinor = vivas.reduce(
    (total, obligacion) => total + decimalToMinor(obligacion.cuota_mensual_cop),
    0,
  );

  return {
    provider: PROVIDER,
    country: 'CO',
    fetchedAt,
    currency: 'COP',
    monthlyDebtPaymentsMinor: cuotaMensualMinor,
    totalDebtMinor: decimalToMinor(data.deuda_total_cop),
    creditScore: rescaleScore(data.puntaje, { min: 150, max: 950 }),
    delinquencies: vivas.filter((obligacion) => obligacion.estado === 'MORA').length,
    activeLoans: vivas.length,
    // Se mira el historial completo, cerradas incluidas: la antigüedad crediticia
    // no desaparece porque un préstamo se termine de pagar.
    oldestAccountOpenedAt: earliest(
      data.obligaciones.map((obligacion) => parseProviderDate(obligacion.fecha_apertura)),
    ),
    raw: payload,
  };
}

@Injectable()
export class DataCreditoCoAdapter implements BankProviderAdapter {
  readonly country = 'CO' as const;
  readonly providerName = PROVIDER;

  constructor(private readonly http: ProviderHttpClient) {}

  async fetchSnapshot(request: BankSnapshotRequest): Promise<BankSnapshot> {
    const payload = await this.http.post(PROVIDER, '/providers/co/historial-crediticio', {
      numero_documento: request.document,
    });

    return mapDataCreditoCo(payload, new Date());
  }
}
