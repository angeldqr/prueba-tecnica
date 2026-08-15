/** Países soportados. Dar de alta uno nuevo empieza por esta lista. */
export const COUNTRY_CODES = ['ES', 'PT', 'IT', 'MX', 'CO', 'BR'] as const;

export type CountryCode = (typeof COUNTRY_CODES)[number];

export function isCountryCode(value: unknown): value is CountryCode {
  return typeof value === 'string' && (COUNTRY_CODES as readonly string[]).includes(value);
}

/** Documento de identidad exigido en cada país. */
export const DOCUMENT_TYPES = ['DNI', 'NIF', 'CODICE_FISCALE', 'CURP', 'CC', 'CPF'] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_BY_COUNTRY: Readonly<Record<CountryCode, DocumentType>> = {
  ES: 'DNI',
  PT: 'NIF',
  IT: 'CODICE_FISCALE',
  MX: 'CURP',
  CO: 'CC',
  BR: 'CPF',
};

/**
 * Moneda de curso legal por país. Los importes viajan siempre en *minor units*
 * (céntimos, centavos) como enteros: nunca en coma flotante.
 */
export const CURRENCY_BY_COUNTRY: Readonly<Record<CountryCode, string>> = {
  ES: 'EUR',
  PT: 'EUR',
  IT: 'EUR',
  MX: 'MXN',
  CO: 'COP',
  BR: 'BRL',
};

export const COUNTRY_NAMES: Readonly<Record<CountryCode, string>> = {
  ES: 'España',
  PT: 'Portugal',
  IT: 'Italia',
  MX: 'México',
  CO: 'Colombia',
  BR: 'Brasil',
};
