import { type CountryCode, DOCUMENT_TYPE_BY_COUNTRY, type DocumentType } from '../country-code';
import { brCpfValidator } from './br-cpf';
import { coCedulaValidator } from './co-cedula';
import { esDniValidator } from './es-dni';
import { itCodiceFiscaleValidator } from './it-codice-fiscale';
import { mxCurpValidator } from './mx-curp';
import { ptNifValidator } from './pt-nif';
import type { DocumentValidationResult, DocumentValidator } from './types';

export * from './types';
export { brCpfValidator, coCedulaValidator, esDniValidator, itCodiceFiscaleValidator, mxCurpValidator, ptNifValidator };

/**
 * Registro de validadores indexado por país. Al ser un `Record` completo sobre
 * `CountryCode`, añadir un país sin registrar su validador rompe la compilación.
 */
export const DOCUMENT_VALIDATOR_BY_COUNTRY: Readonly<Record<CountryCode, DocumentValidator>> = {
  ES: esDniValidator,
  PT: ptNifValidator,
  IT: itCodiceFiscaleValidator,
  MX: mxCurpValidator,
  CO: coCedulaValidator,
  BR: brCpfValidator,
};

/** Valida un documento con el algoritmo que corresponda al país indicado. */
export function validateDocumentFor(country: CountryCode, raw: string): DocumentValidationResult {
  return DOCUMENT_VALIDATOR_BY_COUNTRY[country].validate(raw);
}

/** Tipo de documento exigido por el país, para etiquetar el formulario. */
export function documentTypeFor(country: CountryCode): DocumentType {
  return DOCUMENT_TYPE_BY_COUNTRY[country];
}
