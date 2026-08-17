import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { ROUTES } from './responses';

const PORT = Number(process.env.MOCK_PROVIDERS_PORT ?? 3002);

/**
 * Caos inyectado. Arranca con lo que diga el entorno y se puede cambiar en caliente
 * por /admin/chaos, que es lo que permite guionizar la prueba de resiliencia: subir
 * los fallos al 100 %, ver abrirse el circuito y volver a bajarlos.
 */
const chaos = {
  failureRate: Number(process.env.BANK_PROVIDER_FAILURE_RATE ?? 0),
  latencyMs: Number(process.env.BANK_PROVIDER_LATENCY_MS ?? 0),
};

const MAX_BODY_BYTES = 64 * 1024;

function json(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);

  response.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
  });
  response.end(payload);
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('cuerpo demasiado grande');
    chunks.push(chunk as Buffer);
  }

  if (chunks.length === 0) return {};

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const server = createServer((request, response) => {
  void handle(request, response).catch(() => {
    json(response, 500, { error: 'fallo interno del simulador' });
  });
});

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const path = (request.url ?? '').split('?')[0] ?? '';

  if (path === '/health') {
    json(response, 200, { status: 'ok', chaos });
    return;
  }

  if (path === '/admin/chaos' && request.method === 'POST') {
    const body = (await readBody(request)) as Partial<typeof chaos>;

    if (typeof body.failureRate === 'number') {
      chaos.failureRate = Math.min(Math.max(body.failureRate, 0), 1);
    }
    if (typeof body.latencyMs === 'number') {
      chaos.latencyMs = Math.max(body.latencyMs, 0);
    }

    json(response, 200, chaos);
    return;
  }

  const route = ROUTES[path];

  if (!route || request.method !== 'POST') {
    json(response, 404, { error: 'ruta desconocida' });
    return;
  }

  // El cuerpo se lee antes de decidir nada, incluso para acabar devolviendo un 503.
  // Responder dejando datos sin consumir en el socket hace que el cliente vea un
  // corte de conexión en lugar del código que se le quería dar, y una prueba de
  // resiliencia necesita distinguir un 503 de un fallo de red.
  let body: Record<string, unknown>;

  try {
    body = (await readBody(request)) as Record<string, unknown>;
  } catch {
    json(response, 400, { error: 'cuerpo ilegible' });
    return;
  }

  if (chaos.latencyMs > 0) await sleep(chaos.latencyMs);

  // Un 503 es lo que el adaptador debe reintentar; distinto de un 400, que no.
  if (Math.random() < chaos.failureRate) {
    json(response, 503, { error: 'proveedor no disponible' });
    return;
  }

  const document = body[route.field];

  if (typeof document !== 'string' || document.length === 0) {
    json(response, 400, { error: `falta el campo ${route.field}` });
    return;
  }

  json(response, 200, route.build(document));
}

server.listen(PORT, () => {
  process.stdout.write(
    `proveedores simulados en http://localhost:${PORT} ` +
      `(fallos ${Math.round(chaos.failureRate * 100)} %, latencia ${chaos.latencyMs} ms)\n`,
  );
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
