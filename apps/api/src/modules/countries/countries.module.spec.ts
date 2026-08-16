import { Test } from '@nestjs/testing';
import {
  COUNTRY_CODES,
  CURRENCY_BY_COUNTRY,
  DOCUMENT_TYPE_BY_COUNTRY,
  type CountryCode,
} from '@bravo/contracts';
import { beforeAll, describe, expect, it } from 'vitest';
import { NotFoundError, ValidationError } from '../../shared/domain';
import { CountryRulesService } from './application/country-rules.service';
import { CountriesModule } from './countries.module';
import { COUNTRY_REGISTRY, type CountryRegistry, type RuleContext } from './domain';

const EVALUATED_AT = new Date('2026-01-15T00:00:00Z');
const BIRTH_DATE = new Date('1990-06-15T00:00:00Z');

interface Sample {
  readonly amountMinor: number;
  readonly termMonths: number;
  readonly monthlyIncomeMinor: number;
  readonly employmentMonths: number;
  readonly bank: NonNullable<RuleContext['bank']>;
  readonly validDocument: string;
}

/** Un expediente que cada país aprueba sin objeciones. Sirve de línea base. */
const HEALTHY: Readonly<Record<CountryCode, Sample>> = {
  ES: {
    amountMinor: 500_000,
    termMonths: 36,
    monthlyIncomeMinor: 250_000,
    employmentMonths: 36,
    bank: {
      monthlyDebtPaymentsMinor: 20_000,
      totalDebtMinor: 300_000,
      creditScore: 800,
      delinquencies: 0,
      activeLoans: 1,
    },
    validDocument: '12345678Z',
  },
  PT: {
    amountMinor: 400_000,
    termMonths: 36,
    monthlyIncomeMinor: 150_000,
    employmentMonths: 24,
    bank: {
      monthlyDebtPaymentsMinor: 15_000,
      totalDebtMinor: 200_000,
      creditScore: 700,
      delinquencies: 0,
      activeLoans: 1,
    },
    validDocument: '123456789',
  },
  IT: {
    amountMinor: 800_000,
    termMonths: 48,
    monthlyIncomeMinor: 200_000,
    employmentMonths: 36,
    bank: {
      monthlyDebtPaymentsMinor: 20_000,
      totalDebtMinor: 250_000,
      creditScore: 720,
      delinquencies: 0,
      activeLoans: 1,
    },
    validDocument: 'RSSMRA85M01H501Q',
  },
  MX: {
    amountMinor: 3_000_000,
    termMonths: 24,
    monthlyIncomeMinor: 2_000_000,
    employmentMonths: 24,
    bank: {
      monthlyDebtPaymentsMinor: 200_000,
      totalDebtMinor: 1_500_000,
      creditScore: 700,
      delinquencies: 0,
      activeLoans: 2,
    },
    validDocument: 'GOMC900514HDFNRR92',
  },
  CO: {
    amountMinor: 500_000_000,
    termMonths: 24,
    monthlyIncomeMinor: 300_000_000,
    employmentMonths: 24,
    bank: {
      monthlyDebtPaymentsMinor: 20_000_000,
      totalDebtMinor: 1_000_000_000,
      creditScore: 700,
      delinquencies: 0,
      activeLoans: 1,
    },
    validDocument: '1020304050',
  },
  BR: {
    amountMinor: 1_000_000,
    termMonths: 36,
    monthlyIncomeMinor: 500_000,
    employmentMonths: 24,
    bank: {
      monthlyDebtPaymentsMinor: 50_000,
      totalDebtMinor: 400_000,
      creditScore: 700,
      delinquencies: 0,
      activeLoans: 1,
    },
    validDocument: '52998224725',
  },
};

function contextFor(country: CountryCode, overrides: Partial<RuleContext> = {}): RuleContext {
  const sample = HEALTHY[country];

  return {
    country,
    requestedAmountMinor: sample.amountMinor,
    currency: CURRENCY_BY_COUNTRY[country],
    termMonths: sample.termMonths,
    applicant: {
      monthlyIncomeMinor: sample.monthlyIncomeMinor,
      employmentMonths: sample.employmentMonths,
      birthDate: BIRTH_DATE,
    },
    bank: sample.bank,
    evaluatedAt: EVALUATED_AT,
    ...overrides,
  };
}

describe('CountriesModule', () => {
  let registry: CountryRegistry;
  let countryRules: CountryRulesService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [CountriesModule] }).compile();

    registry = moduleRef.get<CountryRegistry>(COUNTRY_REGISTRY);
    countryRules = moduleRef.get(CountryRulesService);
  });

  describe('registro', () => {
    it('resuelve un ruleset por cada país declarado', () => {
      expect(registry.supportedCountries()).toEqual([...COUNTRY_CODES]);
      expect(registry.all()).toHaveLength(COUNTRY_CODES.length);
    });

    it('devuelve el ruleset que corresponde al código', () => {
      for (const country of COUNTRY_CODES) {
        expect(registry.get(country).country).toBe(country);
      }
    });

    it('un país no soportado no se resuelve', () => {
      expect(() => registry.get('FR' as CountryCode)).toThrow(NotFoundError);
    });
  });

  describe.each(COUNTRY_CODES)('%s', (country) => {
    it('declara el documento y la moneda del país', () => {
      const ruleSet = registry.get(country);

      expect(ruleSet.documentType).toBe(DOCUMENT_TYPE_BY_COUNTRY[country]);
      expect(ruleSet.limits.currency).toBe(CURRENCY_BY_COUNTRY[country]);
    });

    it('no repite el código de ninguna regla', () => {
      const codes = registry.get(country).rules.map((rule) => rule.code);

      expect(new Set(codes).size).toBe(codes.length);
    });

    it('delega la validación del documento en el validador del país', () => {
      const result = countryRules.validateDocument(country, HEALTHY[country].validDocument);

      expect(result).toMatchObject({ valid: true, type: DOCUMENT_TYPE_BY_COUNTRY[country] });
    });

    it('aprueba un expediente sin objeciones', () => {
      const evaluation = countryRules.evaluate(contextFor(country));

      expect(evaluation.violations).toEqual([]);
      expect(evaluation.decision).toBe('APPROVE');
    });

    it('espera a los datos bancarios en vez de decidir sin ellos', () => {
      const evaluation = countryRules.evaluate(contextFor(country, { bank: undefined }));

      expect(evaluation.decision).toBe('PENDING_BANK_DATA');
      expect(evaluation.deferredRules.length).toBeGreaterThan(0);
    });

    it('rechaza un importe por encima del máximo', () => {
      const { maxAmountMinor } = registry.get(country).limits;
      const evaluation = countryRules.evaluate(
        contextFor(country, { requestedAmountMinor: maxAmountMinor + 1 }),
      );

      expect(evaluation.decision).toBe('REJECT');
      expect(evaluation.violations.map((violation) => violation.code)).toContain('AMOUNT_WITHIN_LIMITS');
    });

    it('rechaza a un menor de edad', () => {
      const evaluation = countryRules.evaluate(
        contextFor(country, {
          applicant: {
            monthlyIncomeMinor: HEALTHY[country].monthlyIncomeMinor,
            employmentMonths: HEALTHY[country].employmentMonths,
            birthDate: new Date('2012-01-01T00:00:00Z'),
          },
        }),
      );

      expect(evaluation.violations.map((violation) => violation.code)).toContain('AGE_WITHIN_LIMITS');
      expect(evaluation.decision).toBe('REJECT');
    });

    it('las reglas que dicen necesitar datos bancarios se aplazan sin ellos, y solo esas', () => {
      const withoutBank = contextFor(country, { bank: undefined });

      for (const rule of registry.get(country).rules) {
        const outcome = rule.evaluate(withoutBank);

        expect(outcome.status === 'deferred', `${country} ${rule.code}`).toBe(rule.requiresBankData);
      }
    });

    it('rechaza una moneda que no es la del país', () => {
      expect(() => countryRules.evaluate(contextFor(country, { currency: 'XXX' }))).toThrow(ValidationError);
    });
  });

  describe('particularidades por país', () => {
    it('ES manda los importes altos a revisión adicional en vez de rechazarlos', () => {
      const evaluation = countryRules.evaluate(contextFor('ES', { requestedAmountMinor: 2_000_000 }));

      expect(evaluation.decision).toBe('REVIEW');
      expect(evaluation.violations.map((violation) => violation.code)).toEqual(['AMOUNT_REVIEW_THRESHOLD']);
      expect(countryRules.reviewStateFor('ES')).toBe('ADDITIONAL_REVIEW');
    });

    it('BR deriva la revisión a cumplimiento', () => {
      expect(countryRules.reviewStateFor('BR')).toBe('COMPLIANCE_REVIEW');
    });

    it('el resto de países usa la revisión manual corriente', () => {
      for (const country of ['PT', 'IT', 'MX', 'CO'] as const) {
        expect(countryRules.reviewStateFor(country)).toBe('MANUAL_REVIEW');
      }
    });

    it('PT limita el importe a ocho veces el ingreso anual', () => {
      const annual = HEALTHY.PT.monthlyIncomeMinor * 12;
      const evaluation = countryRules.evaluate(contextFor('PT', { requestedAmountMinor: annual * 8 + 1 }));

      expect(evaluation.violations.map((violation) => violation.code)).toContain('AMOUNT_TO_INCOME_RATIO');
    });

    it('MX limita el importe a seis veces el ingreso mensual', () => {
      const evaluation = countryRules.evaluate(
        contextFor('MX', {
          requestedAmountMinor: HEALTHY.MX.monthlyIncomeMinor * 6 + 1,
        }),
      );

      expect(evaluation.violations.map((violation) => violation.code)).toContain('AMOUNT_TO_INCOME_RATIO');
    });

    it('BR exige un score Serasa de al menos 500', () => {
      const evaluation = countryRules.evaluate(
        contextFor('BR', { bank: { ...HEALTHY.BR.bank, creditScore: 499 } }),
      );

      expect(evaluation.decision).toBe('REJECT');
      expect(evaluation.violations.map((violation) => violation.code)).toContain('MINIMUM_CREDIT_SCORE');
    });

    it('CO mira la capacidad de pago y la deuda acumulada por separado', () => {
      const codes = registry.get('CO').rules.map((rule) => rule.code);

      expect(codes).toContain('DEBT_TO_INCOME_RATIO');
      expect(codes).toContain('TOTAL_DEBT_TO_INCOME_RATIO');
    });
  });

  describe('catálogo', () => {
    it('expone un país por cada ruleset con sus reglas resumidas', () => {
      const catalog = countryRules.catalog();

      expect(catalog).toHaveLength(COUNTRY_CODES.length);

      for (const entry of catalog) {
        expect(entry.rules.length).toBeGreaterThan(0);
        expect(entry.currency).toBe(CURRENCY_BY_COUNTRY[entry.code]);
        expect(entry.name.length).toBeGreaterThan(0);
      }
    });

    it('no filtra la función de evaluación de las reglas', () => {
      const [first] = countryRules.catalog();
      const [rule] = first?.rules ?? [];

      expect(rule && Object.keys(rule).sort()).toEqual(['code', 'description', 'requiresBankData']);
    });
  });
});
