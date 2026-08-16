import { Injectable, type PipeTransform } from '@nestjs/common';
import { COUNTRY_CODES, isCountryCode, type CountryCode } from '@bravo/contracts';
import { ValidationError } from '../domain';

/** Acepta el código en cualquier caja y devuelve el literal ya estrechado. */
@Injectable()
export class ParseCountryPipe implements PipeTransform<unknown, CountryCode> {
  transform(value: unknown): CountryCode {
    const candidate = typeof value === 'string' ? value.trim().toUpperCase() : value;

    if (!isCountryCode(candidate)) {
      throw new ValidationError('País no soportado', {
        received: value,
        supported: COUNTRY_CODES,
      });
    }

    return candidate;
  }
}
