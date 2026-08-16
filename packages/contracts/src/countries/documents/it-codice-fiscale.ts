import {
  type DocumentValidationResult,
  type DocumentValidator,
  invalid,
  normalizeDocument,
  valid,
} from './types';

/**
 * Codice Fiscale italiano.
 *
 * Dieciséis caracteres: 6 letras del apellido y nombre, 2 dígitos del año, 1 letra
 * del mes, 2 dígitos del día (+40 si el titular es mujer), 4 caracteres del código
 * catastral del municipio y 1 letra de control.
 *
 * El carácter de control suma cada posición con una tabla distinta según sea impar o
 * par (contando desde 1) y toma el resultado módulo 26.
 *
 * Cuando dos personas generan el mismo código, la Agenzia delle Entrate aplica
 * *omocodia*: sustituye dígitos por letras según una tabla fija. Esos códigos son
 * válidos y hay que aceptarlos.
 */
const ODD_VALUES: Readonly<Record<string, number>> = {
  '0': 1,
  '1': 0,
  '2': 5,
  '3': 7,
  '4': 9,
  '5': 13,
  '6': 15,
  '7': 17,
  '8': 19,
  '9': 21,
  A: 1,
  B: 0,
  C: 5,
  D: 7,
  E: 9,
  F: 13,
  G: 15,
  H: 17,
  I: 19,
  J: 21,
  K: 2,
  L: 4,
  M: 18,
  N: 20,
  O: 11,
  P: 3,
  Q: 6,
  R: 8,
  S: 12,
  T: 14,
  U: 16,
  V: 10,
  W: 22,
  X: 25,
  Y: 24,
  Z: 23,
};

/** Sustituciones de omocodia: la letra de la izquierda representa al dígito de la derecha. */
const OMOCODIA_TO_DIGIT: Readonly<Record<string, string>> = {
  L: '0',
  M: '1',
  N: '2',
  P: '3',
  Q: '4',
  R: '5',
  S: '6',
  T: '7',
  U: '8',
  V: '9',
};

/** Posiciones (0-indexed) que originalmente contienen dígitos y admiten omocodia. */
const NUMERIC_POSITIONS = [6, 7, 9, 10, 12, 13, 14] as const;

const MONTH_LETTERS = 'ABCDEHLMPRST';

const SHAPE = /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/;

function evenValue(char: string): number {
  return char >= '0' && char <= '9' ? char.charCodeAt(0) - 48 : char.charCodeAt(0) - 65;
}

/** Revierte las sustituciones de omocodia para poder leer la fecha real. */
function decodeOmocodia(doc: string): string {
  const chars = doc.split('');
  for (const position of NUMERIC_POSITIONS) {
    const char = chars[position];
    if (char !== undefined && char in OMOCODIA_TO_DIGIT) {
      chars[position] = OMOCODIA_TO_DIGIT[char] as string;
    }
  }
  return chars.join('');
}

export const itCodiceFiscaleValidator: DocumentValidator = {
  type: 'CODICE_FISCALE',

  validate(raw: string): DocumentValidationResult {
    const doc = normalizeDocument(raw);

    if (doc.length === 0) {
      return invalid('CODICE_FISCALE', 'EMPTY', 'El Codice Fiscale es obligatorio.');
    }

    if (doc.length !== 16) {
      return invalid('CODICE_FISCALE', 'INVALID_LENGTH', 'El Codice Fiscale debe tener 16 caracteres.');
    }

    if (!SHAPE.test(doc)) {
      return invalid('CODICE_FISCALE', 'INVALID_FORMAT', 'La estructura del Codice Fiscale es inválida.');
    }

    // La fecha se comprueba sobre el código con la omocodia ya revertida.
    const decoded = decodeOmocodia(doc);
    const monthIndex = MONTH_LETTERS.indexOf(decoded.charAt(8));
    if (monthIndex === -1) {
      return invalid('CODICE_FISCALE', 'INVALID_DATE', 'La letra del mes de nacimiento no es válida.');
    }

    const rawDay = Number(decoded.slice(9, 11));
    // Las mujeres llevan el día incrementado en 40; así el sexo va implícito.
    const day = rawDay > 40 ? rawDay - 40 : rawDay;
    if (day < 1 || day > 31) {
      return invalid('CODICE_FISCALE', 'INVALID_DATE', 'El día de nacimiento no es válido.');
    }

    let total = 0;
    for (let i = 0; i < 15; i += 1) {
      const char = doc.charAt(i);
      // Posición impar en base 1 == índice par en base 0.
      total += i % 2 === 0 ? (ODD_VALUES[char] ?? 0) : evenValue(char);
    }

    const expected = String.fromCharCode(65 + (total % 26));

    if (expected !== doc.charAt(15)) {
      return invalid(
        'CODICE_FISCALE',
        'INVALID_CHECKSUM',
        `Carácter de control incorrecto: se esperaba ${expected}.`,
      );
    }

    return valid('CODICE_FISCALE', doc);
  },
};
