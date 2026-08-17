import type { CountryCode } from '@bravo/contracts';
import { describe, expect, it } from 'vitest';
import { IllegalTransitionError, ValidationError } from '../../../shared/domain';
import { Applicant } from './applicant';
import { CreditApplication } from './credit-application';
import { LoanTerms } from './loan-terms';

const NACIMIENTO = new Date('1990-06-15T00:00:00Z');
const CREADA = new Date('2026-08-16T10:00:00Z');

const DOCUMENTOS: Readonly<Record<CountryCode, string>> = {
  ES: '12345678Z',
  PT: '123456789',
  IT: 'RSSMRA85M01H501Q',
  MX: 'GOMC900514HDFNRR92',
  CO: '1020304050',
  BR: '52998224725',
};

function solicitante(country: CountryCode = 'ES'): Applicant {
  return Applicant.create(
    {
      fullName: 'María Fernández',
      document: DOCUMENTOS[country],
      birthDate: NACIMIENTO,
      monthlyIncomeMinor: 250_000,
      employmentMonths: 36,
    },
    country,
  );
}

function solicitud(country: CountryCode = 'ES'): CreditApplication {
  return CreditApplication.create({
    id: '0199c0de-0000-7000-8000-000000000001',
    country,
    applicant: solicitante(country),
    terms: LoanTerms.create({ amountMinor: 500_000, country, termMonths: 36 }),
    createdAt: CREADA,
  });
}

describe('Applicant', () => {
  it('normaliza el documento al construirlo', () => {
    const applicant = Applicant.create(
      {
        fullName: 'María Fernández',
        document: '1234-5678 z',
        birthDate: NACIMIENTO,
        monthlyIncomeMinor: 250_000,
        employmentMonths: 36,
      },
      'ES',
    );

    expect(applicant.document).toBe('12345678Z');
    expect(applicant.documentType).toBe('DNI');
  });

  it('no se puede construir con un documento inválido', () => {
    expect(() =>
      Applicant.create(
        {
          fullName: 'María Fernández',
          document: '12345678A',
          birthDate: NACIMIENTO,
          monthlyIncomeMinor: 250_000,
          employmentMonths: 36,
        },
        'ES',
      ),
    ).toThrow(ValidationError);
  });

  it('exige un nombre', () => {
    expect(() =>
      Applicant.create(
        {
          fullName: '  ',
          document: '12345678Z',
          birthDate: NACIMIENTO,
          monthlyIncomeMinor: 250_000,
          employmentMonths: 36,
        },
        'ES',
      ),
    ).toThrow(ValidationError);
  });

  it('rechaza un ingreso negativo', () => {
    expect(() =>
      Applicant.create(
        {
          fullName: 'María Fernández',
          document: '12345678Z',
          birthDate: NACIMIENTO,
          monthlyIncomeMinor: -1,
          employmentMonths: 36,
        },
        'ES',
      ),
    ).toThrow(ValidationError);
  });

  it('serializarlo por accidente no filtra datos personales', () => {
    const serializado = JSON.stringify(solicitante());

    expect(serializado).not.toContain('12345678Z');
    expect(serializado).not.toContain('María');
    expect(JSON.parse(serializado)).toEqual({ documentType: 'DNI', redacted: true });
  });

  it('interpolarlo en un texto tampoco', () => {
    expect(`${solicitante()}`).toBe('Applicant(DNI, datos ocultos)');
  });
});

describe('LoanTerms', () => {
  it('toma la moneda del país, no de quien solicita', () => {
    expect(LoanTerms.create({ amountMinor: 500_000, country: 'MX', termMonths: 24 }).currency).toBe('MXN');
    expect(LoanTerms.create({ amountMinor: 500_000, country: 'BR', termMonths: 24 }).currency).toBe('BRL');
  });

  it('rechaza un plazo que no es un entero positivo', () => {
    for (const termMonths of [0, -12, 12.5]) {
      expect(() => LoanTerms.create({ amountMinor: 500_000, country: 'ES', termMonths })).toThrow(
        ValidationError,
      );
    }
  });

  it('rechaza un importe que no es entero de minor units', () => {
    expect(() => LoanTerms.create({ amountMinor: 500_000.5, country: 'ES', termMonths: 36 })).toThrow(
      ValidationError,
    );
  });
});

describe('CreditApplication', () => {
  it('nace en borrador y sin versión', () => {
    const application = solicitud();

    expect(application.status).toBe('DRAFT');
    expect(application.version).toBe(0);
  });

  it('registra el evento de creación', () => {
    const eventos = solicitud().pullEvents();

    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({
      type: 'application.created',
      status: 'DRAFT',
      country: 'ES',
      actor: 'applicant',
    });
  });

  it('no admite un importe construido para otro país', () => {
    expect(() =>
      CreditApplication.create({
        id: 'x',
        country: 'ES',
        applicant: solicitante('ES'),
        terms: LoanTerms.create({ amountMinor: 500_000, country: 'MX', termMonths: 36 }),
      }),
    ).toThrow(ValidationError);
  });

  it('avanza de estado y sube la versión', () => {
    const application = solicitud();

    application.transitionTo('SUBMITTED', { actor: 'applicant', reviewState: 'ADDITIONAL_REVIEW' });

    expect(application.status).toBe('SUBMITTED');
    expect(application.version).toBe(1);
  });

  it('la versión esperada por el bloqueo optimista no se mueve con las transiciones', () => {
    const application = CreditApplication.rehydrate({
      id: 'x',
      country: 'ES',
      applicant: solicitante(),
      terms: LoanTerms.create({ amountMinor: 500_000, country: 'ES', termMonths: 36 }),
      status: 'SUBMITTED',
      version: 3,
      createdAt: CREADA,
    });

    application.transitionTo('BANK_DATA_PENDING', {
      actor: 'system',
      reviewState: 'ADDITIONAL_REVIEW',
    });

    // La que se escribe sube; la del WHERE tiene que seguir siendo la leída, o el
    // UPDATE no casaría ninguna fila y todo guardado parecería una colisión.
    expect(application.version).toBe(4);
    expect(application.expectedVersion).toBe(3);
  });

  it('varias transiciones seguidas no alteran la versión esperada', () => {
    const application = solicitud();
    const opciones = { actor: 'system', reviewState: 'ADDITIONAL_REVIEW' } as const;

    application.transitionTo('SUBMITTED', { ...opciones, actor: 'applicant' });
    application.transitionTo('BANK_DATA_PENDING', opciones);
    application.transitionTo('BANK_DATA_RECEIVED', opciones);

    expect(application.version).toBe(3);
    expect(application.expectedVersion).toBe(0);
  });

  it('registra quién dio de alta la solicitud', () => {
    const porOperador = CreditApplication.create({
      id: 'x',
      country: 'ES',
      applicant: solicitante(),
      terms: LoanTerms.create({ amountMinor: 500_000, country: 'ES', termMonths: 36 }),
      actor: 'admin',
    });

    expect(porOperador.pullEvents()[0]).toMatchObject({ actor: 'admin' });
    expect(solicitud().pullEvents()[0]).toMatchObject({ actor: 'applicant' });
  });

  it('una transición ilegal no cambia nada', () => {
    const application = solicitud();

    expect(() =>
      application.transitionTo('APPROVED', { actor: 'admin', reviewState: 'ADDITIONAL_REVIEW' }),
    ).toThrow(IllegalTransitionError);

    expect(application.status).toBe('DRAFT');
    expect(application.version).toBe(0);
  });

  it('respeta el estado de revisión del país', () => {
    const application = solicitud('ES');
    const opciones = { actor: 'system', reviewState: 'ADDITIONAL_REVIEW' } as const;

    application.transitionTo('SUBMITTED', { ...opciones, actor: 'applicant' });
    application.transitionTo('BANK_DATA_PENDING', opciones);
    application.transitionTo('BANK_DATA_RECEIVED', opciones);
    application.transitionTo('RISK_EVALUATING', opciones);

    expect(() => application.transitionTo('COMPLIANCE_REVIEW', opciones)).toThrow(IllegalTransitionError);

    application.transitionTo('ADDITIONAL_REVIEW', opciones);
    expect(application.status).toBe('ADDITIONAL_REVIEW');
  });

  it('acumula un evento por cada cambio, con el estado de origen', () => {
    const application = solicitud();
    const opciones = { actor: 'system', reviewState: 'ADDITIONAL_REVIEW' } as const;

    application.transitionTo('SUBMITTED', { ...opciones, actor: 'applicant' });
    application.transitionTo('BANK_DATA_PENDING', opciones);

    const eventos = application.pullEvents();

    expect(eventos).toHaveLength(3);
    expect(eventos.slice(1)).toMatchObject([
      { type: 'application.status_changed', from: 'DRAFT', to: 'SUBMITTED' },
      { type: 'application.status_changed', from: 'SUBMITTED', to: 'BANK_DATA_PENDING' },
    ]);
  });

  it('pullEvents vacía la lista para que un segundo guardado no duplique el historial', () => {
    const application = solicitud();

    expect(application.pullEvents()).toHaveLength(1);
    expect(application.pullEvents()).toHaveLength(0);
  });

  it('arrastra el motivo cuando se indica', () => {
    const application = solicitud();

    application.transitionTo('CANCELLED', {
      actor: 'applicant',
      reviewState: 'ADDITIONAL_REVIEW',
      reason: 'El solicitante encontró mejores condiciones',
    });

    const [, cancelacion] = application.pullEvents();
    expect(cancelacion).toMatchObject({ reason: 'El solicitante encontró mejores condiciones' });
  });

  it('rehidratar no genera eventos ni toca la versión', () => {
    const application = CreditApplication.rehydrate({
      id: 'x',
      country: 'BR',
      applicant: solicitante('BR'),
      terms: LoanTerms.create({ amountMinor: 1_000_000, country: 'BR', termMonths: 36 }),
      status: 'MANUAL_REVIEW',
      version: 7,
      createdAt: CREADA,
    });

    expect(application.status).toBe('MANUAL_REVIEW');
    expect(application.version).toBe(7);
    expect(application.pullEvents()).toEqual([]);
  });

  it('sigue el flujo completo hasta el desembolso', () => {
    const application = solicitud('MX');
    const sistema = { actor: 'system', reviewState: 'MANUAL_REVIEW' } as const;

    application.transitionTo('SUBMITTED', { ...sistema, actor: 'applicant' });
    application.transitionTo('BANK_DATA_PENDING', sistema);
    application.transitionTo('BANK_DATA_RECEIVED', sistema);
    application.transitionTo('RISK_EVALUATING', sistema);
    application.transitionTo('AUTO_APPROVED', sistema);
    application.transitionTo('APPROVED', sistema);
    application.transitionTo('DISBURSED', { ...sistema, actor: 'admin' });

    expect(application.status).toBe('DISBURSED');
    expect(application.version).toBe(7);
  });

  it('desde un estado final ya no se mueve', () => {
    const application = solicitud();

    application.transitionTo('CANCELLED', { actor: 'applicant', reviewState: 'MANUAL_REVIEW' });

    expect(() =>
      application.transitionTo('SUBMITTED', { actor: 'applicant', reviewState: 'MANUAL_REVIEW' }),
    ).toThrow(IllegalTransitionError);
  });
});
