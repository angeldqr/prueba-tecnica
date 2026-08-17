import type { CountryCode, CreditApplicationStatus } from '@bravo/contracts';
import type { CreditApplication } from '../credit-application';

export const CREDIT_APPLICATION_REPOSITORY = Symbol('CREDIT_APPLICATION_REPOSITORY');

/**
 * Países que el solicitante de la consulta puede ver.
 *
 * Va en la firma de todos los métodos de lectura a propósito: si el filtro viviera
 * solo en un guard, bastaría con que un caso de uso nuevo se olvidara de anotarlo
 * para que un operador de México leyera expedientes de Brasil. Aquí no se puede
 * consultar sin decir qué se tiene derecho a ver.
 */
export type CountryScope =
  /** Acceso a todos los países. Solo lo construyen los roles que de verdad lo tienen. */
  { readonly kind: 'all' } | { readonly kind: 'countries'; readonly countries: readonly CountryCode[] };

/**
 * El acceso total se declara, no se deduce de una lista vacía.
 *
 * La columna `countries` de la base nace con DEFAULT '{}', así que si «vacío»
 * significara «todos», un operador dado de alta sin países asignados vería los seis.
 * Un control de autorización tiene que fallar cerrado: sin países, no se ve nada.
 */
export function scopeForCountries(countries: readonly CountryCode[]): CountryScope {
  return { kind: 'countries', countries };
}

export const FULL_SCOPE: CountryScope = { kind: 'all' };

export function scopeAllows(scope: CountryScope, country: CountryCode): boolean {
  return scope.kind === 'all' || scope.countries.includes(country);
}

export interface ApplicationFilters {
  readonly country?: CountryCode;
  readonly status?: readonly CreditApplicationStatus[];
  readonly createdFrom?: Date;
  readonly createdUntil?: Date;
}

/**
 * Cursor de paginación keyset. Se pagina por (created_at, id) en vez de con OFFSET
 * porque el coste de OFFSET crece con la página: en la número mil el motor descarta
 * un millón de filas antes de devolver veinte.
 */
export interface KeysetCursor {
  readonly createdAt: Date;
  readonly id: string;
}

export interface ApplicationPage {
  readonly items: readonly CreditApplication[];
  readonly nextCursor: KeysetCursor | null;
}

/** Tope duro de página. Va en el contrato para que no lo decida cada implementación. */
export const MAX_PAGE_SIZE = 100;

export interface CreditApplicationRepository {
  save(application: CreditApplication): Promise<void>;

  /**
   * Guarda comprobando que nadie la ha tocado mientras tanto.
   *
   * La versión esperada la lleva el propio agregado en `expectedVersion`, y no se
   * pasa por parámetro a propósito: obligar a quien llama a acordarse de guardarla
   * antes de mover el estado es justo el error que este método existe para evitar.
   *
   * Devuelve false si esa versión ya no está en la base, que es la señal de que otro
   * worker se adelantó. Quien llama decide si releer y reintentar o abandonar;
   * devolver un booleano en vez de lanzar deja claro que perder la carrera es un
   * resultado normal y no una avería.
   */
  saveIfUnchanged(application: CreditApplication): Promise<boolean>;

  findById(id: string, scope: CountryScope): Promise<CreditApplication | null>;

  findByDocumentHash(
    documentHash: string,
    country: CountryCode,
    scope: CountryScope,
  ): Promise<CreditApplication | null>;

  /** El límite se recorta a MAX_PAGE_SIZE: la paginación keyset evita el coste del
   *  OFFSET, pero no el de materializar en memoria lo que se pida. */
  list(
    filters: ApplicationFilters,
    scope: CountryScope,
    pagination: { limit: number; cursor?: KeysetCursor },
  ): Promise<ApplicationPage>;

  /**
   * Recuento por país y estado para las facetas del listado.
   *
   * Es un método aparte porque el listado no se cachea —demasiada cardinalidad de
   * filtros para que el hit rate valga algo— pero estos contadores sí.
   */
  countByStatus(
    filters: ApplicationFilters,
    scope: CountryScope,
  ): Promise<Record<CreditApplicationStatus, number>>;
}
