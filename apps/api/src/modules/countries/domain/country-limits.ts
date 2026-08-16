/** Rangos operativos del producto en un país. Importes siempre en minor units. */
export interface CountryLimits {
  readonly minAmountMinor: number;
  readonly maxAmountMinor: number;
  readonly minTermMonths: number;
  readonly maxTermMonths: number;
  readonly minAge: number;
  /** Edad máxima al firmar. El vencimiento se comprueba aparte, con el plazo. */
  readonly maxAge: number;
  readonly currency: string;
}
