import { CURRENCY_BY_COUNTRY, type CountryCode } from '@bravo/contracts';
import { ValidationError } from './errors';

/**
 * Importe en *minor units* (céntimos, centavos) con su moneda. Nunca coma flotante:
 * 0.1 + 0.2 no es 0.3 y en un sistema de crédito eso acaba en un descuadre.
 */
export class Money {
  private constructor(
    readonly amountMinor: number,
    readonly currency: string,
  ) {}

  static of(amountMinor: number, currency: string): Money {
    if (!Number.isSafeInteger(amountMinor)) {
      throw new ValidationError('El importe debe ser un entero de minor units', { amountMinor });
    }
    if (amountMinor < 0) {
      throw new ValidationError('El importe no puede ser negativo', { amountMinor });
    }
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new ValidationError('La moneda debe ser un código ISO 4217', { currency });
    }

    return new Money(amountMinor, currency);
  }

  static forCountry(amountMinor: number, country: CountryCode): Money {
    return Money.of(amountMinor, CURRENCY_BY_COUNTRY[country]);
  }

  static zero(currency: string): Money {
    return Money.of(0, currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(this.amountMinor + other.amountMinor, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return Money.of(this.amountMinor - other.amountMinor, this.currency);
  }

  /** Redondea al céntimo más cercano; el factor sí puede ser decimal (un interés, un ratio). */
  multiply(factor: number): Money {
    if (!Number.isFinite(factor) || factor < 0) {
      throw new ValidationError('El factor debe ser un número no negativo', { factor });
    }

    return Money.of(Math.round(this.amountMinor * factor), this.currency);
  }

  /** Proporción entre dos importes de la misma moneda. Divisor cero devuelve Infinity. */
  ratioTo(other: Money): number {
    this.assertSameCurrency(other);
    return other.amountMinor === 0 ? Infinity : this.amountMinor / other.amountMinor;
  }

  isGreaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amountMinor > other.amountMinor;
  }

  isLessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amountMinor < other.amountMinor;
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amountMinor === other.amountMinor;
  }

  toJSON(): { amountMinor: number; currency: string } {
    return { amountMinor: this.amountMinor, currency: this.currency };
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new ValidationError('No se pueden operar importes de monedas distintas', {
        left: this.currency,
        right: other.currency,
      });
    }
  }
}
