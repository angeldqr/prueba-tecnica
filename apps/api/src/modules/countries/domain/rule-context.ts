import type { CountryCode } from '@bravo/contracts';

export interface ApplicantProfile {
  readonly monthlyIncomeMinor: number;
  /** Meses en el empleo actual. */
  readonly employmentMonths: number;
  readonly birthDate: Date;
}

/**
 * Lo que el proveedor bancario aporta a la decisión, ya traducido por la capa
 * anticorrupción: cada país devuelve su formato y su escala de score, y aquí llega
 * todo homogéneo. El score va normalizado a 0–1000 venga de donde venga.
 */
export interface BankAssessment {
  readonly monthlyDebtPaymentsMinor: number;
  readonly totalDebtMinor: number;
  readonly creditScore: number;
  readonly delinquencies: number;
  readonly activeLoans: number;
}

export interface RuleContext {
  readonly country: CountryCode;
  readonly requestedAmountMinor: number;
  readonly currency: string;
  readonly termMonths: number;
  readonly applicant: ApplicantProfile;
  /**
   * Ausente mientras el enriquecimiento bancario no ha vuelto. Las reglas que lo
   * necesitan se aplazan en lugar de dar por buena una solicitud sin datos.
   */
  readonly bank?: BankAssessment;
  readonly evaluatedAt: Date;
}

export function ageAt(birthDate: Date, reference: Date): number {
  let age = reference.getUTCFullYear() - birthDate.getUTCFullYear();

  const monthDelta = reference.getUTCMonth() - birthDate.getUTCMonth();
  const beforeBirthday =
    monthDelta < 0 || (monthDelta === 0 && reference.getUTCDate() < birthDate.getUTCDate());

  if (beforeBirthday) age -= 1;

  return age;
}

export function annualIncomeMinor(applicant: ApplicantProfile): number {
  return applicant.monthlyIncomeMinor * 12;
}
