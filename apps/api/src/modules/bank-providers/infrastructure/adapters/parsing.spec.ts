import { describe, expect, it } from 'vitest';
import { dateFromMonthsAgo, decimalToMinor, earliest, parseProviderDate } from './parsing';

describe('decimalToMinor', () => {
  it('convierte decimales en texto sin pasar por coma flotante', () => {
    expect(decimalToMinor('12500.75')).toBe(1_250_075);
    expect(decimalToMinor('0.01')).toBe(1);
    expect(decimalToMinor('0')).toBe(0);
  });

  it('acierta donde multiplicar por cien falla', () => {
    // 18750.50 * 100 da 1875049.9999999998 en coma flotante.
    expect(decimalToMinor('18750.50')).toBe(1_875_050);
    expect(decimalToMinor(18_750.5)).toBe(1_875_050);
  });

  it('con un número de entrada arrastra el redondeo que ya trae el double', () => {
    // 1.005 se almacena como 1.00499…, así que baja a 1.00 y no hay forma de saber
    // que quien lo escribió quería 1,005. Los proveedores que mandan el importe como
    // cadena evitan esto, y por eso el conversor acepta ambas formas.
    expect(decimalToMinor(1.005)).toBe(100);
    expect(decimalToMinor('1.005')).toBe(100);
  });

  it('rellena los decimales que falten', () => {
    expect(decimalToMinor('42')).toBe(4_200);
    expect(decimalToMinor('42.5')).toBe(4_250);
  });

  it('recorta los decimales que sobran', () => {
    expect(decimalToMinor('42.567')).toBe(4_256);
  });

  it('acepta un exponente distinto para monedas sin céntimos', () => {
    expect(decimalToMinor('1500', 0)).toBe(1_500);
  });

  it('conserva el signo', () => {
    expect(decimalToMinor('-30.25')).toBe(-3_025);
  });

  it('rechaza lo que no es un número en vez de devolver NaN', () => {
    expect(() => decimalToMinor('mil euros')).toThrow(RangeError);
    expect(() => decimalToMinor('')).toThrow(RangeError);
    expect(() => decimalToMinor('1,5')).toThrow(RangeError);
    expect(() => decimalToMinor('1e5')).toThrow(RangeError);
  });

  it('rechaza importes fuera del entero seguro', () => {
    expect(() => decimalToMinor('999999999999999999')).toThrow(RangeError);
  });
});

describe('parseProviderDate', () => {
  it('acepta el formato ISO', () => {
    expect(parseProviderDate('2015-04-12').toISOString()).toBe('2015-04-12T00:00:00.000Z');
  });

  it('acepta el dd/MM/yyyy italiano', () => {
    expect(parseProviderDate('12/04/2015').toISOString()).toBe('2015-04-12T00:00:00.000Z');
  });

  it('no confunde el día con el mes', () => {
    // 04/12 es el 4 de diciembre en dd/MM, no el 12 de abril.
    expect(parseProviderDate('04/12/2015').toISOString()).toBe('2015-12-04T00:00:00.000Z');
  });

  it('rechaza un formato que no reconoce', () => {
    expect(() => parseProviderDate('12-04-2015')).toThrow(RangeError);
    expect(() => parseProviderDate('ayer')).toThrow(RangeError);
  });

  it('rechaza una fecha que no existe en vez de dejarla desbordar', () => {
    // Date convertiría el 30 de febrero en 2 de marzo sin decir nada.
    expect(() => parseProviderDate('2015-02-30')).toThrow(RangeError);
    expect(() => parseProviderDate('2015-04-31')).toThrow(RangeError);
    expect(() => parseProviderDate('30/02/2015')).toThrow(RangeError);
    expect(() => parseProviderDate('2015-13-01')).toThrow(RangeError);
  });

  it('acepta el 29 de febrero de un año bisiesto', () => {
    expect(parseProviderDate('2016-02-29').toISOString()).toBe('2016-02-29T00:00:00.000Z');
    expect(() => parseProviderDate('2015-02-29')).toThrow(RangeError);
  });
});

describe('dateFromMonthsAgo', () => {
  it('resta los meses a la referencia', () => {
    const resultado = dateFromMonthsAgo(24, new Date('2026-08-16T00:00:00Z'));

    expect(resultado.toISOString().slice(0, 10)).toBe('2024-08-16');
  });

  it('cero meses deja la referencia intacta', () => {
    const referencia = new Date('2026-08-16T00:00:00Z');

    expect(dateFromMonthsAgo(0, referencia).getTime()).toBe(referencia.getTime());
  });
});

describe('earliest', () => {
  it('devuelve la más antigua', () => {
    const fechas = [new Date('2020-01-01'), new Date('2015-06-30'), new Date('2018-03-12')];

    expect(earliest(fechas)?.toISOString()).toBe(new Date('2015-06-30').toISOString());
  });

  it('una lista vacía no tiene fecha', () => {
    expect(earliest([])).toBeNull();
  });
});
