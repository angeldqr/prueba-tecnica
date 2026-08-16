import {
  type DocumentValidationResult,
  type DocumentValidator,
  invalid,
  normalizeDocument,
  valid,
} from './types';

/**
 * Cédula de Ciudadanía colombiana.
 *
 * La cédula no lleva dígito de verificación: es un número secuencial asignado por la
 * Registraduría. El NIT empresarial sí lo lleva, pero este documento no. Aquí la
 * comprobación es estructural y de rango; que la cédula exista y corresponda al
 * titular lo confirma DataCrédito al consultar el perfil.
 *
 * Rangos asignados históricamente:
 *  - 1 – 19 999 999: hombres cedulados antes de ~1988.
 *  - 20 000 000 – 99 999 999: mujeres ceduladas antes de ~1988.
 *  - 1 000 000 000 – 1 999 999 999: emitidas desde ~2000.
 */
const SHAPE = /^[1-9]\d{5,9}$/;

const LEGACY_MAX = 99_999_999;
const MODERN_MIN = 1_000_000_000;
const MODERN_MAX = 1_999_999_999;

export const coCedulaValidator: DocumentValidator = {
  type: 'CC',

  validate(raw: string): DocumentValidationResult {
    const doc = normalizeDocument(raw);

    if (doc.length === 0) {
      return invalid('CC', 'EMPTY', 'La cédula es obligatoria.');
    }

    if (doc.length < 6 || doc.length > 10) {
      return invalid('CC', 'INVALID_LENGTH', 'La cédula debe tener entre 6 y 10 dígitos.');
    }

    if (!SHAPE.test(doc)) {
      return invalid(
        'CC',
        'INVALID_FORMAT',
        'La cédula solo puede contener dígitos y no puede empezar por cero.',
      );
    }

    const numeric = Number(doc);
    const inLegacyRange = numeric >= 1 && numeric <= LEGACY_MAX;
    const inModernRange = numeric >= MODERN_MIN && numeric <= MODERN_MAX;

    if (!inLegacyRange && !inModernRange) {
      return invalid('CC', 'INVALID_FORMAT', 'El número de cédula está fuera de los rangos emitidos.');
    }

    return valid('CC', doc);
  },
};
