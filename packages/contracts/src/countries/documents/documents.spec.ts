import { describe, expect, it } from 'vitest';
import { COUNTRY_CODES, type CountryCode } from '../country-code';
import { DOCUMENT_VALIDATOR_BY_COUNTRY, validateDocumentFor } from './index';

/** Documentos válidos de referencia. La aritmética de cada uno queda anotada al lado. */
const VALID: Readonly<Record<CountryCode, readonly string[]>> = {
  // 12345678 mod 23 = 14; "TRWAGMYFPDXBNJZSQVHLCKE"[14] = 'Z'
  // X1234567: X vale 0; 1234567 mod 23 = 19 -> 'L'
  ES: ['12345678Z', 'X1234567L', '00000000T'],
  // 1*9+2*8+3*7+4*6+5*5+6*4+7*3+8*2 = 156; 156 mod 11 = 2; 11-2 = 9
  // 999999990: prefijo 99; 9*(9+8+7+6+5+4+3+2) = 396; 396 mod 11 = 0
  PT: ['123456789', '999999990'],
  // RSSMRA85M01H501: suma 120; 120 mod 26 = 16; 'A'+16 = 'Q'
  // Los dos últimos llevan omocodia.
  IT: [
    'RSSMRA85M01H501Q',
    'VRDLGU75T05F205W',
    'BNCMRA90A41L219Y',
    'RSSMRA85M01H50MI',
    'RSSMRA85M01H5LMT',
  ],
  MX: ['GOMC900514HDFNRR92', 'MELM850101MDFNPR03', 'HEGA010203HMCRRLA1'],
  CO: ['1020304050', '19345678', '1000000000'],
  // 52998224725: verificadores 2 y 5
  BR: ['52998224725', '11144477735'],
};

describe('validadores de documento por país', () => {
  describe.each(COUNTRY_CODES)('%s', (country) => {
    const samples = VALID[country];

    it('acepta los documentos válidos de referencia', () => {
      for (const sample of samples) {
        const result = validateDocumentFor(country, sample);
        expect(result, `${country} ${sample}`).toMatchObject({ valid: true, normalized: sample });
      }
    });

    it('rechaza la cadena vacía', () => {
      const result = validateDocumentFor(country, '');
      expect(result).toMatchObject({ valid: false, code: 'EMPTY' });
    });

    it('rechaza solo espacios en blanco', () => {
      expect(validateDocumentFor(country, '   ')).toMatchObject({ valid: false, code: 'EMPTY' });
    });

    it('normaliza espacios, guiones, puntos y minúsculas', () => {
      const sample = samples[0] as string;
      const messy = sample.toLowerCase().split('').join('-');
      const result = validateDocumentFor(country, messy);
      expect(result).toMatchObject({ valid: true, normalized: sample });
    });

    it('devuelve el tipo de documento del país', () => {
      const expected = DOCUMENT_VALIDATOR_BY_COUNTRY[country].type;
      expect(validateDocumentFor(country, samples[0] as string).type).toBe(expected);
    });

    it('rechaza un documento demasiado corto', () => {
      const result = validateDocumentFor(country, '1');
      expect(result.valid).toBe(false);
    });
  });
});

describe('sensibilidad al error de transcripción', () => {
  /**
   * Tasa mínima de detección de una sustitución de un solo carácter. El umbral varía
   * por país porque lo fija el módulo del algoritmo:
   *
   *  - DNI (mod 23), Codice Fiscale (mod 26), NIF y CPF (mod 11) atrapan casi todo.
   *  - CURP (mod 10) se queda alrededor del 88 %: con 37 caracteres proyectados sobre
   *    10 residuos no da más de sí.
   */
  const MIN_DETECTION_RATE: Partial<Record<CountryCode, number>> = {
    ES: 0.95,
    PT: 0.9,
    IT: 0.95,
    MX: 0.85,
    BR: 0.9,
  };

  it.each(Object.keys(MIN_DETECTION_RATE) as CountryCode[])(
    '%s: alterar un solo carácter invalida el documento',
    (country) => {
      const original = VALID[country][0] as string;

      let detected = 0;
      let attempted = 0;

      for (let i = 0; i < original.length; i += 1) {
        const current = original.charAt(i);
        const replacements = /\d/.test(current)
          ? '0123456789'.split('').filter((d) => d !== current)
          : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').filter((l) => l !== current);

        for (const replacement of replacements) {
          const mutated = original.slice(0, i) + replacement + original.slice(i + 1);
          attempted += 1;
          if (!validateDocumentFor(country, mutated).valid) {
            detected += 1;
          }
        }
      }

      expect(detected / attempted).toBeGreaterThan(MIN_DETECTION_RATE[country] as number);
    },
  );
});

describe('reglas específicas por país', () => {
  it('ES: rechaza una letra de control incorrecta', () => {
    expect(validateDocumentFor('ES', '12345678A')).toMatchObject({
      valid: false,
      code: 'INVALID_CHECKSUM',
    });
  });

  it('PT: rechaza un prefijo que no existe', () => {
    expect(validateDocumentFor('PT', '400000000')).toMatchObject({
      valid: false,
      code: 'INVALID_PREFIX',
    });
  });

  it('PT: acepta los prefijos especiales de dos cifras', () => {
    const base = '45000000';
    let total = 0;
    for (let i = 0; i < 8; i += 1) total += Number(base.charAt(i)) * (9 - i);
    const remainder = total % 11;
    const check = remainder < 2 ? 0 : 11 - remainder;
    expect(validateDocumentFor('PT', `${base}${check}`).valid).toBe(true);
  });

  it('IT: rechaza una letra de mes inexistente', () => {
    // 'Z' no está entre ABCDEHLMPRST
    expect(validateDocumentFor('IT', 'RSSMRA85Z01H501Q')).toMatchObject({ valid: false });
  });

  it('IT: acepta el día +40 que codifica al titular femenino', () => {
    expect(validateDocumentFor('IT', 'BNCMRA90A41L219Y').valid).toBe(true);
  });

  it('MX: rechaza una entidad federativa inexistente', () => {
    const withBadState = 'GOMC900514HZZNRR92';
    expect(validateDocumentFor('MX', withBadState)).toMatchObject({
      valid: false,
      code: 'INVALID_REGION',
    });
  });

  it('MX: rechaza un mes de nacimiento fuera de rango', () => {
    expect(validateDocumentFor('MX', 'GOMC901314HDFNRR92')).toMatchObject({ valid: false });
  });

  it('BR: rechaza las secuencias de dígito repetido', () => {
    for (let d = 0; d <= 9; d += 1) {
      const sequence = String(d).repeat(11);
      expect(validateDocumentFor('BR', sequence), sequence).toMatchObject({
        valid: false,
        code: 'BLACKLISTED_SEQUENCE',
      });
    }
  });

  it('CO: rechaza un número que empieza por cero', () => {
    expect(validateDocumentFor('CO', '0123456')).toMatchObject({
      valid: false,
      code: 'INVALID_FORMAT',
    });
  });

  it('CO: rechaza un número fuera de los rangos emitidos', () => {
    // Entre 100 000 000 y 999 999 999 no se ha emitido ninguna cédula.
    expect(validateDocumentFor('CO', '500000000')).toMatchObject({
      valid: false,
      code: 'INVALID_FORMAT',
    });
  });
});

describe('cobertura del registro', () => {
  it('hay un validador para cada país soportado', () => {
    for (const country of COUNTRY_CODES) {
      expect(DOCUMENT_VALIDATOR_BY_COUNTRY[country]).toBeDefined();
    }
    expect(Object.keys(DOCUMENT_VALIDATOR_BY_COUNTRY)).toHaveLength(COUNTRY_CODES.length);
  });

  it('cada país tiene al menos un documento válido de referencia', () => {
    for (const country of COUNTRY_CODES) {
      expect(VALID[country].length, country).toBeGreaterThan(0);
    }
  });
});
