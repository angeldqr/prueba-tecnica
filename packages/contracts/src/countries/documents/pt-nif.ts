import {
  type DocumentValidationResult,
  type DocumentValidator,
  invalid,
  normalizeDocument,
  valid,
} from './types';

/**
 * NIF portugués (Número de Identificação Fiscal).
 *
 * Nueve dígitos donde el último es de control, calculado por módulo 11 con pesos
 * descendentes de 9 a 2.
 *
 * El primer dígito codifica la naturaleza del contribuyente: 1-3 personas físicas,
 * 5 sociedades, 6 entidades públicas, 8 empresarios individuales. El 4, el 7 y el 9
 * solo aparecen con ciertos prefijos de dos cifras, que se listan aparte.
 */
const VALID_FIRST_DIGITS = new Set(['1', '2', '3', '5', '6', '8']);

const VALID_TWO_DIGIT_PREFIXES = new Set([
  '45', // no residentes
  '70', // herencia yacente
  '71', // no residentes sujetos a retención
  '72', // fondos de inversión
  '74', // no residentes sin establecimiento
  '75', // organismos internacionales
  '77', // atribución oficiosa
  '79', // régimen excepcional
  '90', // condominios y sociedades irregulares
  '91', // condominios y sociedades irregulares
  '98', // no residentes sin establecimiento estable
  '99', // sociedades civiles sin personalidad jurídica
]);

const SHAPE = /^\d{9}$/;

export const ptNifValidator: DocumentValidator = {
  type: 'NIF',

  validate(raw: string): DocumentValidationResult {
    const doc = normalizeDocument(raw);

    if (doc.length === 0) {
      return invalid('NIF', 'EMPTY', 'El NIF es obligatorio.');
    }

    if (doc.length !== 9) {
      return invalid('NIF', 'INVALID_LENGTH', 'El NIF debe tener 9 dígitos.');
    }

    if (!SHAPE.test(doc)) {
      return invalid('NIF', 'INVALID_FORMAT', 'El NIF solo puede contener dígitos.');
    }

    const first = doc.charAt(0);
    const prefix = doc.slice(0, 2);

    if (!VALID_FIRST_DIGITS.has(first) && !VALID_TWO_DIGIT_PREFIXES.has(prefix)) {
      return invalid('NIF', 'INVALID_PREFIX', `El NIF no puede empezar por ${prefix}.`);
    }

    let total = 0;
    for (let i = 0; i < 8; i += 1) {
      total += Number(doc.charAt(i)) * (9 - i);
    }

    const remainder = total % 11;
    const expected = remainder < 2 ? 0 : 11 - remainder;

    if (expected !== Number(doc.charAt(8))) {
      return invalid('NIF', 'INVALID_CHECKSUM', `Dígito de control incorrecto: se esperaba ${expected}.`);
    }

    return valid('NIF', doc);
  },
};
