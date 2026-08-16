import { COUNTRY_CODES, CREDIT_APPLICATION_STATUSES } from '@bravo/contracts';
import { describe, expect, it } from 'vitest';
import { ApplicationStatus, Country } from '../../../generated/prisma/enums';

/**
 * Los mismos valores viven en dos sitios: el enum de Postgres, que da integridad
 * referencial, y la unión de @bravo/contracts, que comparten API y frontend. Si se
 * separan, el fallo aparece como un error de Prisma en tiempo de ejecución con una
 * solicitud real delante. Aquí salta antes, y en el sitio que lo explica.
 */
describe('paridad entre el esquema de Prisma y los contratos', () => {
  it('los estados de solicitud coinciden', () => {
    expect(Object.keys(ApplicationStatus).sort()).toEqual([...CREDIT_APPLICATION_STATUSES].sort());
  });

  it('los países coinciden', () => {
    expect(Object.keys(Country).sort()).toEqual([...COUNTRY_CODES].sort());
  });
});
