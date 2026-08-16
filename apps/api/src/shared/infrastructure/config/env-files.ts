import { dirname, join } from 'node:path';

/** Cuántos niveles se suben buscando el fichero. Basta para llegar de dist/... a la raíz. */
const MAX_DEPTH = 8;

/**
 * Rutas absolutas donde puede estar el .env, de la más cercana a la más lejana.
 *
 * Se calculan desde la ubicación de este fichero y no desde process.cwd(), porque el
 * cwd depende de cómo se lance el proceso: no es el mismo con `pnpm dev` que
 * ejecutando el compilado desde la raíz o desde el WORKDIR de un contenedor. Las que
 * no existan las ignora @nestjs/config, así que sobra con enumerarlas.
 */
export function envFileCandidates(from: string = __dirname): string[] {
  const candidates: string[] = [];

  let directory = from;

  for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
    candidates.push(join(directory, '.env.local'), join(directory, '.env'));

    const parent = dirname(directory);
    if (parent === directory) break;

    directory = parent;
  }

  return candidates;
}
