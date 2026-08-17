import { describe, expect, it } from 'vitest';
import { rescaleScore, scoreFromGrade } from './score';

describe('rescaleScore', () => {
  it('lleva los extremos a los extremos', () => {
    expect(rescaleScore(400, { min: 400, max: 850 })).toBe(0);
    expect(rescaleScore(850, { min: 400, max: 850 })).toBe(1000);
  });

  it('el punto medio cae en la mitad', () => {
    expect(rescaleScore(625, { min: 400, max: 850 })).toBe(500);
    expect(rescaleScore(50, { min: 0, max: 100 })).toBe(500);
  });

  it('recorta lo que se sale del rango en vez de extrapolar', () => {
    expect(rescaleScore(100, { min: 400, max: 850 })).toBe(0);
    expect(rescaleScore(9_999, { min: 400, max: 850 })).toBe(1000);
  });

  it('la escala 0–1000 se queda como está', () => {
    expect(rescaleScore(685, { min: 0, max: 1000 })).toBe(685);
  });

  it('rechaza un rango imposible en vez de dividir entre cero', () => {
    expect(() => rescaleScore(5, { min: 10, max: 10 })).toThrow(RangeError);
    expect(() => rescaleScore(5, { min: 10, max: 1 })).toThrow(RangeError);
  });
});

describe('scoreFromGrade', () => {
  const grados = ['A', 'B', 'C', 'D', 'E'] as const;

  it('la mejor letra puntúa el máximo y la peor el mínimo', () => {
    expect(scoreFromGrade('A', grados)).toBe(1000);
    expect(scoreFromGrade('E', grados)).toBe(0);
  });

  it('las intermedias reparten el rango en orden descendente', () => {
    const puntuaciones = grados.map((grado) => scoreFromGrade(grado, grados));

    expect(puntuaciones).toEqual([1000, 750, 500, 250, 0]);
  });

  it('una letra que no existe es un error, no un cero silencioso', () => {
    expect(() => scoreFromGrade('Z', grados)).toThrow(RangeError);
  });
});
