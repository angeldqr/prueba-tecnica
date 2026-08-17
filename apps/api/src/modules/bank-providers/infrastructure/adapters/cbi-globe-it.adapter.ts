import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  ProviderContractError,
  ProviderRejectedError,
  rescaleScore,
  type BankProviderAdapter,
  type BankSnapshot,
  type BankSnapshotRequest,
} from '../../domain';
import { ProviderHttpClient } from '../http/provider-http.client';
import { decimalToMinor, parseProviderDate } from './parsing';

const PROVIDER = 'cbi-globe-it';

const importo = z.object({
  importo: z.number().nonnegative(),
  divisa: z.literal('EUR'),
});

/**
 * Formato de CBI Globe: todo anidado bajo `soggetto`, las fechas en dd/MM/yyyy y un
 * campo `esito` que indica si la consulta fue bien, en vez de usar el código HTTP.
 * Un 200 con `esito: "KO"` es un rechazo, y aquí se traduce como tal.
 */
const responseSchema = z.object({
  esito: z.string(),
  soggetto: z
    .object({
      profiloCreditizio: z.object({
        rating: z.number(),
        ratingScala: z.number().positive(),
      }),
      esposizione: z.object({
        totale: importo,
        rataMensile: importo,
      }),
      rapporti: z.object({
        attivi: z.number().int().nonnegative(),
        insoluti: z.number().int().nonnegative(),
        primaApertura: z.string().nullable(),
      }),
    })
    .optional(),
});

export type CbiGlobeItResponse = z.infer<typeof responseSchema>;

export function mapCbiGlobeIt(payload: unknown, fetchedAt: Date): BankSnapshot {
  const parsed = responseSchema.safeParse(payload);

  if (!parsed.success) {
    throw new ProviderContractError(PROVIDER, parsed.error.issues[0]?.message ?? 'formato desconocido');
  }

  if (parsed.data.esito !== 'OK') {
    // Reintentar no cambiaría el veredicto: es una respuesta completa y negativa.
    throw new ProviderRejectedError(PROVIDER, 200);
  }

  const soggetto = parsed.data.soggetto;
  if (!soggetto) {
    throw new ProviderContractError(PROVIDER, 'esito OK sin datos del soggetto');
  }

  const { profiloCreditizio: perfil, esposizione: exposicion, rapporti: cuentas } = soggetto;

  return {
    provider: PROVIDER,
    country: 'IT',
    fetchedAt,
    currency: 'EUR',
    monthlyDebtPaymentsMinor: decimalToMinor(exposicion.rataMensile.importo),
    totalDebtMinor: decimalToMinor(exposicion.totale.importo),
    // La escala la declara la propia respuesta, no se da por supuesta.
    creditScore: rescaleScore(perfil.rating, { min: 0, max: perfil.ratingScala }),
    delinquencies: cuentas.insoluti,
    activeLoans: cuentas.attivi,
    oldestAccountOpenedAt: cuentas.primaApertura ? parseProviderDate(cuentas.primaApertura) : null,
    raw: payload,
  };
}

@Injectable()
export class CbiGlobeItAdapter implements BankProviderAdapter {
  readonly country = 'IT' as const;
  readonly providerName = PROVIDER;

  constructor(private readonly http: ProviderHttpClient) {}

  async fetchSnapshot(request: BankSnapshotRequest): Promise<BankSnapshot> {
    const payload = await this.http.post(PROVIDER, '/providers/it/posizione-creditizia', {
      codiceFiscale: request.document,
    });

    return mapCbiGlobeIt(payload, new Date());
  }
}
