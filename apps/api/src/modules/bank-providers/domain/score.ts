/** Escala común a la que se traduce todo score, venga como venga del proveedor. */
export const SCORE_MIN = 0;
export const SCORE_MAX = 1000;

/**
 * Lleva un score de la escala del proveedor a la común.
 *
 * Buró puntúa de 400 a 850, DataCrédito de 150 a 950 y SIBS de 0 a 100: sin
 * reescalar, un 600 significaría cosas distintas según el país y las reglas de
 * negocio no podrían compartir umbral.
 */
export function rescaleScore(value: number, from: { min: number; max: number }): number {
  if (from.max <= from.min) {
    throw new RangeError('El rango de origen del score no es válido');
  }

  const clamped = Math.min(Math.max(value, from.min), from.max);
  const ratio = (clamped - from.min) / (from.max - from.min);

  return Math.round(SCORE_MIN + ratio * (SCORE_MAX - SCORE_MIN));
}

/** Traduce una calificación por letras a la escala común, repartiendo el rango. */
export function scoreFromGrade(grade: string, grades: readonly string[]): number {
  const position = grades.indexOf(grade);

  if (position === -1) {
    throw new RangeError(`Calificación desconocida: ${grade}`);
  }

  // La mejor letra va primero, así que la posición se invierte.
  return rescaleScore(grades.length - 1 - position, { min: 0, max: grades.length - 1 });
}
