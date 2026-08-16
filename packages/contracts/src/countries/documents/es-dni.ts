import {
  type DocumentValidationResult,
  type DocumentValidator,
  invalid,
  normalizeDocument,
  valid,
} from './types';

/**
 * DNI/NIE español.
 *
 * La letra final sale de indexar esta tabla con el número de 8 cifras módulo 23. El
 * orden lo fija el Ministerio del Interior y omite I, Ñ, O y U para no confundirlas
 * con 1 y 0.
 *
 * En el NIE la letra inicial se sustituye por un dígito antes de calcular.
 */
const CHECK_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

const NIE_PREFIX_TO_DIGIT: Readonly<Record<string, string>> = { X: '0', Y: '1', Z: '2' };

const SHAPE = /^[XYZ0-9]\d{7}[A-Z]$/;

export const esDniValidator: DocumentValidator = {
  type: 'DNI',

  validate(raw: string): DocumentValidationResult {
    const doc = normalizeDocument(raw);

    if (doc.length === 0) {
      return invalid('DNI', 'EMPTY', 'El DNI/NIE es obligatorio.');
    }

    if (doc.length !== 9) {
      return invalid('DNI', 'INVALID_LENGTH', 'El DNI/NIE debe tener 9 caracteres.');
    }

    if (!SHAPE.test(doc)) {
      return invalid(
        'DNI',
        'INVALID_FORMAT',
        'Formato inválido: se esperan 8 dígitos y una letra, o X/Y/Z seguido de 7 dígitos y una letra.',
      );
    }

    const first = doc.charAt(0);
    const numericPart = (NIE_PREFIX_TO_DIGIT[first] ?? first) + doc.slice(1, 8);
    const expected = CHECK_LETTERS.charAt(Number(numericPart) % 23);

    if (expected !== doc.charAt(8)) {
      return invalid('DNI', 'INVALID_CHECKSUM', `Letra de control incorrecta: se esperaba ${expected}.`);
    }

    return valid('DNI', doc);
  },
};
