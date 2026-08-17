/**
 * Conversiones de los formatos que llegan de fuera a los tipos internos.
 *
 * Los importes se pasan a *minor units* trabajando sobre el texto, nunca
 * multiplicando en coma flotante: `18750.50 * 100` da 1875049.9999999998, y un
 * céntimo perdido en cada solicitud es un descuadre contable.
 *
 * Con un número de entrada el redondeo ya viene hecho por quien lo parseó —1.005 se
 * almacena como 1.00499…, y de ahí no se recupera—, así que los proveedores que
 * envían los importes como cadena son los que permiten ser exactos.
 */

const DECIMAL = /^-?\d+(\.\d+)?$/;

export function decimalToMinor(value: string | number, exponent = 2): number {
  const text = typeof value === 'number' ? value.toFixed(exponent) : value.trim();

  if (!DECIMAL.test(text)) {
    throw new RangeError(`Importe con formato inesperado: ${String(value)}`);
  }

  const negative = text.startsWith('-');
  const [whole = '0', fraction = ''] = text.replace('-', '').split('.');

  // Rellena o recorta la parte decimal hasta el número de dígitos de la moneda.
  const scaled = fraction.padEnd(exponent, '0').slice(0, exponent);
  const minor = Number(`${whole}${scaled}`);

  if (!Number.isSafeInteger(minor)) {
    throw new RangeError(`Importe fuera del rango representable: ${String(value)}`);
  }

  return negative ? -minor : minor;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DMY_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

/** Acepta `yyyy-MM-dd` y `dd/MM/yyyy`, que es lo que usan los proveedores italianos. */
export function parseProviderDate(value: string): Date {
  const text = value.trim();

  if (ISO_DATE.test(text)) {
    const [year, month, day] = text.split('-');
    return utcDate(Number(year), Number(month), Number(day), value);
  }

  const dmy = DMY_DATE.exec(text);
  if (dmy) {
    const [, day, month, year] = dmy;
    return utcDate(Number(year), Number(month), Number(day), value);
  }

  throw new RangeError(`Fecha con formato inesperado: ${value}`);
}

/**
 * Construye la fecha y comprueba que sigue siendo la que se pidió.
 *
 * Date desborda en silencio: un 30 de febrero se convierte en 2 de marzo sin avisar.
 * Aceptarlo sería guardar como historial crediticio una fecha que el proveedor nunca
 * envió, así que se compara componente a componente.
 */
function utcDate(year: number, month: number, day: number, original: string): Date {
  const date = new Date(Date.UTC(year, month - 1, day));

  const desbordo =
    date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day;

  if (Number.isNaN(date.getTime()) || desbordo) {
    throw new RangeError(`Fecha inexistente: ${original}`);
  }

  return date;
}

/** Algunos proveedores dan la antigüedad en meses en vez de la fecha de apertura. */
export function dateFromMonthsAgo(months: number, reference: Date): Date {
  const result = new Date(reference.getTime());
  result.setUTCMonth(result.getUTCMonth() - months);

  return result;
}

/** La más antigua de una lista, o null si viene vacía. */
export function earliest(dates: readonly Date[]): Date | null {
  if (dates.length === 0) return null;

  return dates.reduce((oldest, current) => (current < oldest ? current : oldest));
}
