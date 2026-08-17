import { validateDocumentFor, type CountryCode, type DocumentType } from '@bravo/contracts';
import { ValidationError } from '../../../shared/domain';

export interface ApplicantInput {
  readonly fullName: string;
  readonly document: string;
  readonly birthDate: Date;
  readonly monthlyIncomeMinor: number;
  readonly employmentMonths: number;
}

/**
 * Datos personales del solicitante.
 *
 * El documento se valida y se normaliza al construirlo, así que dentro del dominio no
 * existe un Applicant con un documento inválido: no hace falta volver a comprobarlo
 * en ninguna capa posterior.
 */
export class Applicant {
  private constructor(
    readonly fullName: string,
    readonly document: string,
    readonly documentType: DocumentType,
    readonly birthDate: Date,
    readonly monthlyIncomeMinor: number,
    readonly employmentMonths: number,
  ) {}

  static create(input: ApplicantInput, country: CountryCode): Applicant {
    const fullName = input.fullName.trim();

    if (fullName.length < 2) {
      throw new ValidationError('El nombre del solicitante es obligatorio');
    }

    const document = validateDocumentFor(country, input.document);

    if (!document.valid) {
      throw new ValidationError(document.message, {
        code: document.code,
        documentType: document.type,
        country,
      });
    }

    if (Number.isNaN(input.birthDate.getTime())) {
      throw new ValidationError('La fecha de nacimiento no es válida');
    }

    if (!Number.isSafeInteger(input.monthlyIncomeMinor) || input.monthlyIncomeMinor < 0) {
      throw new ValidationError('El ingreso mensual debe ser un entero no negativo', {
        monthlyIncomeMinor: input.monthlyIncomeMinor,
      });
    }

    if (!Number.isInteger(input.employmentMonths) || input.employmentMonths < 0) {
      throw new ValidationError('La antigüedad laboral debe ser un número de meses no negativo', {
        employmentMonths: input.employmentMonths,
      });
    }

    return new Applicant(
      fullName,
      document.normalized,
      document.type,
      input.birthDate,
      input.monthlyIncomeMinor,
      input.employmentMonths,
    );
  }

  /**
   * Se sobrescriben las dos vías por las que un objeto acaba en un log o en una
   * respuesta sin que nadie lo haya pedido. La redacción de Pino y el filtrado de la
   * capa HTTP siguen ahí; esto es la última barrera, la que no depende de que alguien
   * se acuerde de configurarla.
   */
  toJSON(): { documentType: DocumentType; redacted: true } {
    return { documentType: this.documentType, redacted: true };
  }

  toString(): string {
    return `Applicant(${this.documentType}, datos ocultos)`;
  }
}
