import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

export const CORRELATION_HEADER = 'x-correlation-id';

/**
 * Lo que acompaña a una operación de principio a fin. Viaja por HTTP, entra en el
 * job de la cola y vuelve a salir en el webhook, de modo que un único
 * correlationId reconstruye el flujo asíncrono completo en los logs.
 */
export interface RequestContext {
  readonly correlationId: string;
  readonly userId?: string;
  readonly source: 'http' | 'worker' | 'webhook' | 'system';
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function currentContext(): RequestContext | undefined {
  return storage.getStore();
}

export function currentCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}

export function newCorrelationId(): string {
  return randomUUID();
}

/**
 * Acepta el identificador que llega de fuera solo si tiene forma razonable: es texto
 * que acaba en los logs y en cabeceras de respuesta, así que no se propaga sin mirar.
 */
export function sanitizeCorrelationId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  return /^[\w.:-]{8,128}$/.test(trimmed) ? trimmed : undefined;
}
