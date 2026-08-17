import type { CountryCode } from '@bravo/contracts';
import { Money, ValidationError } from '../../../shared/domain';

/** Lo que se pide: importe, moneda y plazo. Inmutable una vez creado. */
export class LoanTerms {
  private constructor(
    readonly amount: Money,
    readonly termMonths: number,
  ) {}

  static create(input: { amountMinor: number; country: CountryCode; termMonths: number }): LoanTerms {
    if (!Number.isInteger(input.termMonths) || input.termMonths <= 0) {
      throw new ValidationError('El plazo debe ser un número entero de meses positivo', {
        termMonths: input.termMonths,
      });
    }

    // La moneda sale del país, no la elige quien solicita: no hay forma de pedir un
    // crédito en México y que el importe llegue en euros.
    return new LoanTerms(Money.forCountry(input.amountMinor, input.country), input.termMonths);
  }

  get amountMinor(): number {
    return this.amount.amountMinor;
  }

  get currency(): string {
    return this.amount.currency;
  }

  equals(other: LoanTerms): boolean {
    return this.amount.equals(other.amount) && this.termMonths === other.termMonths;
  }
}
