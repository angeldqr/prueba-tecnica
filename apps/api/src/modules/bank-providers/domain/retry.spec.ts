import { describe, expect, it, vi } from 'vitest';
import { backoffDelay, withRetry } from './retry';

const siempreReintentable = () => true;
const nunca = () => false;
const sinEsperar = async (): Promise<void> => undefined;

describe('backoffDelay', () => {
  const opciones = { baseDelayMs: 200, maxDelayMs: 2_000 };

  it('crece de forma exponencial cuando el azar da el máximo', () => {
    const delays = [0, 1, 2, 3].map((intento) => backoffDelay(intento, opciones, () => 1));

    expect(delays).toEqual([200, 400, 800, 1600]);
  });

  it('no pasa del tope', () => {
    expect(backoffDelay(10, opciones, () => 1)).toBe(2_000);
  });

  it('el jitter reparte entre cero y el techo, no lo fija', () => {
    expect(backoffDelay(2, opciones, () => 0)).toBe(0);
    expect(backoffDelay(2, opciones, () => 0.5)).toBe(400);
    expect(backoffDelay(2, opciones, () => 1)).toBe(800);
  });
});

describe('withRetry', () => {
  it('no reintenta si va bien a la primera', async () => {
    const operacion = vi.fn().mockResolvedValue('ok');

    await expect(
      withRetry(operacion, {
        attempts: 3,
        baseDelayMs: 1,
        maxDelayMs: 1,
        isRetryable: siempreReintentable,
        sleep: sinEsperar,
      }),
    ).resolves.toBe('ok');

    expect(operacion).toHaveBeenCalledTimes(1);
  });

  it('reintenta hasta que uno sale bien', async () => {
    const operacion = vi
      .fn()
      .mockRejectedValueOnce(new Error('1'))
      .mockRejectedValueOnce(new Error('2'))
      .mockResolvedValue('ok');

    await expect(
      withRetry(operacion, {
        attempts: 3,
        baseDelayMs: 1,
        maxDelayMs: 1,
        isRetryable: siempreReintentable,
        sleep: sinEsperar,
      }),
    ).resolves.toBe('ok');

    expect(operacion).toHaveBeenCalledTimes(3);
  });

  it('agota los intentos y propaga el último error', async () => {
    const operacion = vi.fn().mockRejectedValue(new Error('sigue fallando'));

    await expect(
      withRetry(operacion, {
        attempts: 3,
        baseDelayMs: 1,
        maxDelayMs: 1,
        isRetryable: siempreReintentable,
        sleep: sinEsperar,
      }),
    ).rejects.toThrow('sigue fallando');

    expect(operacion).toHaveBeenCalledTimes(3);
  });

  it('no insiste con un error que no es reintentable', async () => {
    const operacion = vi.fn().mockRejectedValue(new Error('documento inválido'));

    await expect(
      withRetry(operacion, {
        attempts: 5,
        baseDelayMs: 1,
        maxDelayMs: 1,
        isRetryable: nunca,
        sleep: sinEsperar,
      }),
    ).rejects.toThrow('documento inválido');

    expect(operacion).toHaveBeenCalledTimes(1);
  });

  it('avisa de cada reintento, no del intento inicial', async () => {
    const onRetry = vi.fn();
    const operacion = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue('ok');

    await withRetry(operacion, {
      attempts: 3,
      baseDelayMs: 100,
      maxDelayMs: 100,
      isRetryable: siempreReintentable,
      sleep: sinEsperar,
      random: () => 1,
      onRetry,
    });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(1, 100, expect.any(Error));
  });

  it('espera entre intentos y no tras el último', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const operacion = vi.fn().mockRejectedValue(new Error('x'));

    await expect(
      withRetry(operacion, {
        attempts: 3,
        baseDelayMs: 10,
        maxDelayMs: 10,
        isRetryable: siempreReintentable,
        sleep,
      }),
    ).rejects.toThrow();

    expect(sleep).toHaveBeenCalledTimes(2);
  });
});
