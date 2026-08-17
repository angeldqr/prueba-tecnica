import { COUNTRY_CODES } from '@bravo/contracts';
import { describe, expect, it } from 'vitest';
import { FULL_SCOPE, scopeAllows, scopeForCountries } from './credit-application.repository';

describe('CountryScope', () => {
  it('el acceso total se declara y alcanza a todos los países', () => {
    for (const country of COUNTRY_CODES) {
      expect(scopeAllows(FULL_SCOPE, country), country).toBe(true);
    }
  });

  it('un ámbito acotado solo alcanza a los suyos', () => {
    const scope = scopeForCountries(['MX', 'CO']);

    expect(scopeAllows(scope, 'MX')).toBe(true);
    expect(scopeAllows(scope, 'CO')).toBe(true);
    expect(scopeAllows(scope, 'BR')).toBe(false);
    expect(scopeAllows(scope, 'ES')).toBe(false);
  });

  it('sin países asignados no se ve nada, que es como nace la columna en la base', () => {
    // La columna countries tiene DEFAULT '{}'. Si la lista vacía significara «todos»,
    // un operador dado de alta sin países vería los seis.
    const scope = scopeForCountries([]);

    for (const country of COUNTRY_CODES) {
      expect(scopeAllows(scope, country), country).toBe(false);
    }
  });
});
