import {
  type DocumentValidationResult,
  type DocumentValidator,
  invalid,
  normalizeDocument,
  valid,
} from './types';

/**
 * CURP mexicana (Clave Única de Registro de Población).
 *
 * Dieciocho caracteres: 4 del nombre, 6 de fecha de nacimiento (AAMMDD), 1 de sexo,
 * 2 de entidad federativa, 3 consonantes internas, 1 de homoclave y 1 dígito verificador.
 *
 * La homoclave distingue nacidos antes del año 2000 (dígito) de nacidos a partir de
 * 2000 (letra), lo que permite desambiguar el siglo del año de dos cifras.
 */
const CHECK_DIGIT_DICTIONARY = '0123456789ABCDEFGHIJKLMNÑOPQRSTUVWXYZ';

/** Las 32 entidades federativas más NE para los nacidos en el extranjero. */
const STATE_CODES = new Set([
  'AS',
  'BC',
  'BS',
  'CC',
  'CL',
  'CM',
  'CS',
  'CH',
  'DF',
  'DG',
  'GT',
  'GR',
  'HG',
  'JC',
  'MC',
  'MN',
  'MS',
  'NT',
  'NL',
  'OC',
  'PL',
  'QT',
  'QR',
  'SP',
  'SL',
  'SR',
  'TC',
  'TS',
  'TL',
  'VZ',
  'YN',
  'ZS',
  'NE',
]);

const SHAPE = /^[A-Z][AEIOUX][A-Z]{2}\d{6}[HMX][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[0-9A-Z]\d$/;

export const mxCurpValidator: DocumentValidator = {
  type: 'CURP',

  validate(raw: string): DocumentValidationResult {
    const doc = normalizeDocument(raw);

    if (doc.length === 0) {
      return invalid('CURP', 'EMPTY', 'La CURP es obligatoria.');
    }

    if (doc.length !== 18) {
      return invalid('CURP', 'INVALID_LENGTH', 'La CURP debe tener 18 caracteres.');
    }

    if (!SHAPE.test(doc)) {
      return invalid('CURP', 'INVALID_FORMAT', 'La estructura de la CURP es inválida.');
    }

    const state = doc.slice(11, 13);
    if (!STATE_CODES.has(state)) {
      return invalid('CURP', 'INVALID_REGION', `La entidad federativa "${state}" no existe.`);
    }

    const month = Number(doc.slice(6, 8));
    const day = Number(doc.slice(8, 10));
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return invalid('CURP', 'INVALID_DATE', 'La fecha de nacimiento de la CURP no es válida.');
    }

    let total = 0;
    for (let i = 0; i < 17; i += 1) {
      total += CHECK_DIGIT_DICTIONARY.indexOf(doc.charAt(i)) * (18 - i);
    }

    const expected = (10 - (total % 10)) % 10;

    if (expected !== Number(doc.charAt(17))) {
      return invalid('CURP', 'INVALID_CHECKSUM', `Dígito verificador incorrecto: se esperaba ${expected}.`);
    }

    return valid('CURP', doc);
  },
};
