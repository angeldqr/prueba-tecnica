#!/usr/bin/env node
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const example = join(root, '.env.example');
const target = join(root, '.env');

/**
 * Variables que llevan material criptográfico. El repositorio las deja vacías y cada
 * máquina genera las suyas, así que no hay ningún secreto versionado ni compartido
 * entre entornos.
 */
const GENERATED = new Set([
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'PII_ENCRYPTION_KEY',
  'DOCUMENT_HASH_PEPPER',
  'WEBHOOK_SIGNING_SECRET',
]);

const ASSIGNMENT = /^([A-Z0-9_]+)=(.*)$/;

if (!existsSync(example)) {
  console.error('Falta .env.example en la raíz del repositorio.');
  process.exit(1);
}

if (!existsSync(target)) {
  copyFileSync(example, target);
  console.warn('.env creado a partir de .env.example');
}

const secret = () => randomBytes(32).toString('hex');

const lines = readFileSync(target, 'utf8').split(/\r?\n/);
const present = new Set();
const generated = [];

const updated = lines.map((line) => {
  const match = ASSIGNMENT.exec(line);
  if (!match) return line;

  const [, key, value] = match;
  present.add(key);

  if (!GENERATED.has(key) || value.trim() !== '') return line;

  generated.push(key);
  return `${key}=${secret()}`;
});

/**
 * Las variables que aparecieron en .env.example después de que se creara este .env
 * hay que añadirlas: sin esto el arranque falla con un «Required» que no dice de
 * dónde sale, y el script habría informado de que todo estaba en orden.
 */
const added = [];

for (const line of readFileSync(example, 'utf8').split(/\r?\n/)) {
  const match = ASSIGNMENT.exec(line);
  if (!match) continue;

  const [, key, value] = match;
  if (present.has(key)) continue;

  added.push(key);
  updated.push(`${key}=${GENERATED.has(key) ? secret() : value}`);
}

if (generated.length > 0 || added.length > 0) {
  writeFileSync(target, updated.join('\n'), 'utf8');

  if (generated.length > 0) console.warn(`Claves generadas: ${generated.join(', ')}`);
  if (added.length > 0) console.warn(`Variables nuevas añadidas: ${added.join(', ')}`);
} else {
  console.warn('.env ya está al día. No se ha tocado nada.');
}
