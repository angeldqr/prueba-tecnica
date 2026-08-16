/**
 * Campos que nunca deben aparecer en un log.
 *
 * La lista incluye tanto la ruta concreta (`req.body.document`) como el comodín de
 * un nivel (`*.document`), porque el mismo dato aparece anidado según quién lo
 * registre: el interceptor HTTP, el worker o el reintento del webhook.
 */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-webhook-signature"]',
  'res.headers["set-cookie"]',

  'req.body.document',
  'req.body.fullName',
  'req.body.password',
  'req.body.email',

  '*.document',
  '*.documentNumber',
  '*.fullName',
  '*.password',
  '*.refreshToken',
  '*.accessToken',

  // El snapshot bancario entero: saldos, movimientos y obligaciones del titular.
  '*.bankSnapshot',
  '*.snapshot',
  'bankSnapshot',
] as const;

export const REDACTION_PLACEHOLDER = '[oculto]';
