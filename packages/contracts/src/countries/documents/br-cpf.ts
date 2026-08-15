import { type DocumentValidationResult, type DocumentValidator, invalid, normalizeDocument, valid } from './types';

/**
 * CPF brasileño (Cadastro de Pessoas Físicas).
 *
 * Once dígitos, de los que los dos últimos son de control. Cada uno se calcula por
 * módulo 11 sobre los dígitos previos con pesos descendentes; el segundo incorpora al
 * primero, de modo que un error en cualquier posición altera ambos.
 *
 * Las secuencias de dígito repetido (00000000000, 11111111111…) satisfacen la
 * aritmética, pero la Receita Federal no las emite y hay que rechazarlas aparte.
 */
const SHAPE = /^\d{11}$/;

const REPEATED_SEQUENCE = /^(\d)\1{10}$/;

function checkDigit(digits: string, startWeight: number): number {
  let total = 0;
  for (let i = 0; i < digits.length; i += 1) {
    total += Number(digits.charAt(i)) * (startWeight - i);
  }
  const remainder = total % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export const brCpfValidator: DocumentValidator = {
  type: 'CPF',

  validate(raw: string): DocumentValidationResult {
    const doc = normalizeDocument(raw);

    if (doc.length === 0) {
      return invalid('CPF', 'EMPTY', 'El CPF es obligatorio.');
    }

    if (doc.length !== 11) {
      return invalid('CPF', 'INVALID_LENGTH', 'El CPF debe tener 11 dígitos.');
    }

    if (!SHAPE.test(doc)) {
      return invalid('CPF', 'INVALID_FORMAT', 'El CPF solo puede contener dígitos.');
    }

    if (REPEATED_SEQUENCE.test(doc)) {
      return invalid('CPF', 'BLACKLISTED_SEQUENCE', 'Un CPF con todos los dígitos iguales no es válido.');
    }

    const first = checkDigit(doc.slice(0, 9), 10);
    if (first !== Number(doc.charAt(9))) {
      return invalid('CPF', 'INVALID_CHECKSUM', `Primer dígito verificador incorrecto: se esperaba ${first}.`);
    }

    const second = checkDigit(doc.slice(0, 10), 11);
    if (second !== Number(doc.charAt(10))) {
      return invalid('CPF', 'INVALID_CHECKSUM', `Segundo dígito verificador incorrecto: se esperaba ${second}.`);
    }

    return valid('CPF', doc);
  },
};
