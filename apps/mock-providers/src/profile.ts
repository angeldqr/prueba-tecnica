import { createHash } from 'node:crypto';

/**
 * Perfil crediticio sintético, derivado del propio documento.
 *
 * Es determinista a propósito: la misma persona devuelve siempre los mismos datos,
 * así que un test puede afirmar un resultado concreto y una demo se puede repetir.
 * Con datos aleatorios ninguna de las dos cosas sería posible.
 */
export interface SyntheticProfile {
  /** 0 = perfil pésimo, 1 = inmejorable. */
  readonly quality: number;
  /** Deuda viva en unidades enteras de la moneda del país. */
  readonly totalDebt: number;
  /** Cuota mensual en unidades enteras. */
  readonly monthlyPayment: number;
  readonly activeLoans: number;
  readonly delinquencies: number;
  readonly firstCreditAt: string;
}

/** Escala de los importes según lo que vale un peso, un euro o un real. */
const DEBT_SCALE: Readonly<Record<string, number>> = {
  es: 30_000,
  pt: 25_000,
  it: 35_000,
  mx: 300_000,
  co: 40_000_000,
  br: 60_000,
};

export function profileFor(document: string, country: string): SyntheticProfile {
  const digest = createHash('sha256').update(`${country}:${document}`).digest();

  const byte = (index: number): number => (digest[index] ?? 0) / 255;

  const quality = byte(0);
  const scale = DEBT_SCALE[country] ?? 30_000;

  // Cuanto mejor el perfil, menos deuda arrastra.
  const totalDebt = Math.round(scale * (0.05 + (1 - quality) * 0.6));
  const activeLoans = Math.floor(byte(1) * 4);

  // Los impagos solo aparecen en la cola baja: la mayoría de expedientes están limpios.
  const delinquencies = quality < 0.15 ? 1 + Math.floor(byte(2) * 3) : 0;

  const yearsOfHistory = 2 + Math.floor(byte(3) * 14);
  const firstCredit = new Date(Date.UTC(new Date().getUTCFullYear() - yearsOfHistory, 3, 12));

  return {
    quality,
    totalDebt,
    // Reparto aproximado a cinco años; basta para que la cuota guarde proporción.
    monthlyPayment: Math.round(totalDebt / 60),
    activeLoans,
    delinquencies,
    firstCreditAt: firstCredit.toISOString().slice(0, 10),
  };
}

/** Lleva la calidad del perfil a la escala que usa cada proveedor. */
export function scaleQuality(quality: number, min: number, max: number): number {
  return Math.round(min + quality * (max - min));
}
