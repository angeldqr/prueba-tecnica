import type { CountryCode } from '@bravo/contracts';

export interface BankSnapshotRequest {
  readonly country: CountryCode;
  /** Documento normalizado. Sale de aquí hacia el proveedor y no se guarda en el snapshot. */
  readonly document: string;
}

/**
 * Forma canónica de lo que devuelve un proveedor bancario, ya traducida.
 *
 * Cada país entrega un formato distinto: céntimos enteros, decimales como texto,
 * estructuras anidadas, fechas dd/MM/yyyy y escalas de score que no se parecen entre
 * sí. Todo eso muere en el mapper de cada adaptador; de aquí para adentro el resto
 * del sistema ve siempre lo mismo.
 */
export interface BankSnapshot {
  readonly provider: string;
  readonly country: CountryCode;
  readonly fetchedAt: Date;
  readonly currency: string;

  readonly monthlyDebtPaymentsMinor: number;
  readonly totalDebtMinor: number;
  /** Reescalado a 0–1000 venga en la escala que venga el proveedor. */
  readonly creditScore: number;
  readonly delinquencies: number;
  readonly activeLoans: number;
  readonly oldestAccountOpenedAt: Date | null;

  /**
   * Respuesta tal cual llegó, antes de validarla.
   *
   * Es a propósito el payload sin filtrar y no el resultado de Zod: el esquema
   * descarta las claves que no conoce, y son precisamente esas —un motivo de
   * rechazo nuevo, una marca de disputa— las que hacen falta cuando hay que
   * justificar una decisión meses después y ya no se le puede volver a preguntar
   * al proveedor. Se cifra antes de persistirla y no se serializa nunca.
   */
  readonly raw: unknown;
}
