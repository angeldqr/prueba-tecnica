import { describe, expect, it } from 'vitest';
import { CircuitBreaker } from './circuit-breaker';

function breakerConReloj() {
  let ahora = 1_000_000;

  const breaker = new CircuitBreaker({
    failureThreshold: 3,
    successThreshold: 2,
    openMs: 30_000,
    now: () => ahora,
  });

  return { breaker, avanzar: (ms: number) => (ahora += ms) };
}

describe('CircuitBreaker', () => {
  it('arranca cerrado y deja pasar', () => {
    const { breaker } = breakerConReloj();

    expect(breaker.state).toBe('closed');
    expect(breaker.canAttempt()).toBe(true);
  });

  it('aguanta fallos por debajo del umbral', () => {
    const { breaker } = breakerConReloj();

    breaker.recordFailure();
    breaker.recordFailure();

    expect(breaker.state).toBe('closed');
    expect(breaker.canAttempt()).toBe(true);
  });

  it('un éxito reinicia la cuenta de fallos', () => {
    const { breaker } = breakerConReloj();

    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordSuccess();
    breaker.recordFailure();
    breaker.recordFailure();

    expect(breaker.state).toBe('closed');
  });

  it('abre al alcanzar el umbral', () => {
    const { breaker } = breakerConReloj();

    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();

    expect(breaker.state).toBe('open');
    expect(breaker.canAttempt()).toBe(false);
  });

  it('sigue cerrado mientras no vence la ventana', () => {
    const { breaker, avanzar } = breakerConReloj();

    for (let i = 0; i < 3; i += 1) breaker.recordFailure();
    avanzar(29_999);

    expect(breaker.canAttempt()).toBe(false);
  });

  it('pasa a half-open cuando vence la ventana', () => {
    const { breaker, avanzar } = breakerConReloj();

    for (let i = 0; i < 3; i += 1) breaker.recordFailure();
    avanzar(30_000);

    expect(breaker.canAttempt()).toBe(true);
    expect(breaker.state).toBe('half-open');
  });

  it('en half-open no deja pasar más sondas que éxitos hacen falta', () => {
    const { breaker, avanzar } = breakerConReloj();

    for (let i = 0; i < 3; i += 1) breaker.recordFailure();
    avanzar(30_000);

    // successThreshold es 2: dos sondas entran y la tercera espera.
    expect(breaker.canAttempt()).toBe(true);
    expect(breaker.canAttempt()).toBe(true);
    expect(breaker.canAttempt()).toBe(false);
  });

  it('una sonda resuelta libera su hueco', () => {
    const { breaker, avanzar } = breakerConReloj();

    for (let i = 0; i < 3; i += 1) breaker.recordFailure();
    avanzar(30_000);
    breaker.canAttempt();
    breaker.canAttempt();
    expect(breaker.canAttempt()).toBe(false);

    breaker.recordSuccess();
    expect(breaker.canAttempt()).toBe(true);
  });

  it('un error que no juzga al proveedor libera la sonda sin contar', () => {
    const { breaker, avanzar } = breakerConReloj();

    for (let i = 0; i < 3; i += 1) breaker.recordFailure();
    avanzar(30_000);
    breaker.canAttempt();
    breaker.canAttempt();

    breaker.recordIgnored();

    expect(breaker.state).toBe('half-open');
    expect(breaker.canAttempt()).toBe(true);
  });

  it('un éxito en vuelo no cierra un circuito recién abierto', () => {
    const { breaker } = breakerConReloj();

    for (let i = 0; i < 3; i += 1) breaker.recordFailure();
    expect(breaker.state).toBe('open');

    // Una petición que salió antes de abrirse termina bien ahora: no prueba nada.
    breaker.recordSuccess();

    expect(breaker.state).toBe('open');
    expect(breaker.canAttempt()).toBe(false);
  });

  it('un fallo en vuelo no alarga la ventana de un circuito ya abierto', () => {
    const { breaker, avanzar } = breakerConReloj();

    for (let i = 0; i < 3; i += 1) breaker.recordFailure();
    avanzar(15_000);
    breaker.recordFailure();
    avanzar(15_000);

    expect(breaker.canAttempt()).toBe(true);
  });

  it('cierra tras los éxitos exigidos en half-open', () => {
    const { breaker, avanzar } = breakerConReloj();

    for (let i = 0; i < 3; i += 1) breaker.recordFailure();
    avanzar(30_000);
    breaker.canAttempt();

    breaker.recordSuccess();
    expect(breaker.state).toBe('half-open');

    breaker.recordSuccess();
    expect(breaker.state).toBe('closed');
  });

  it('un solo fallo en half-open vuelve a abrirlo', () => {
    const { breaker, avanzar } = breakerConReloj();

    for (let i = 0; i < 3; i += 1) breaker.recordFailure();
    avanzar(30_000);
    breaker.canAttempt();
    breaker.recordSuccess();
    breaker.recordFailure();

    expect(breaker.state).toBe('open');
  });

  it('reabrir empieza una ventana nueva completa', () => {
    const { breaker, avanzar } = breakerConReloj();

    for (let i = 0; i < 3; i += 1) breaker.recordFailure();
    avanzar(30_000);
    breaker.canAttempt();
    breaker.recordFailure();

    avanzar(29_999);
    expect(breaker.canAttempt()).toBe(false);

    avanzar(1);
    expect(breaker.canAttempt()).toBe(true);
  });
});
