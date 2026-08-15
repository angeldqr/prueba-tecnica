import type { DocumentType } from '../country-code';

/** Motivo por el que un documento se rechaza. Estable: el frontend lo traduce. */
export type DocumentRejectionCode =
  | 'EMPTY'
  | 'INVALID_FORMAT'
  | 'INVALID_LENGTH'
  | 'INVALID_CHECKSUM'
  | 'INVALID_PREFIX'
  | 'INVALID_DATE'
  | 'INVALID_REGION'
  | 'BLACKLISTED_SEQUENCE';

export type DocumentValidationResult =
  | {
      readonly valid: true;
      readonly type: DocumentType;
      /** Documento normalizado: mayúsculas, sin separadores. Es el que se persiste. */
      readonly normalized: string;
    }
  | {
      readonly valid: false;
      readonly type: DocumentType;
      readonly code: DocumentRejectionCode;
      readonly message: string;
    };

export interface DocumentValidator {
  readonly type: DocumentType;
  validate(raw: string): DocumentValidationResult;
}

/** Quita espacios, guiones y puntos, y pasa a mayúsculas. */
export function normalizeDocument(raw: string): string {
  return raw.replace(/[\s.\-/]/g, '').toUpperCase();
}

export function invalid(
  type: DocumentType,
  code: DocumentRejectionCode,
  message: string,
): DocumentValidationResult {
  return { valid: false, type, code, message };
}

export function valid(type: DocumentType, normalized: string): DocumentValidationResult {
  return { valid: true, type, normalized };
}
