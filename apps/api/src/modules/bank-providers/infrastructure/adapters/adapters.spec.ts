import { describe, expect, it } from 'vitest';
import { ProviderContractError, ProviderRejectedError } from '../../domain';
import { mapBuroMx } from './buro-mx.adapter';
import { mapCbiGlobeIt } from './cbi-globe-it.adapter';
import { mapDataCreditoCo } from './datacredito-co.adapter';
import { mapOpenBankingEs } from './openbanking-es.adapter';
import { mapSerasaBr } from './serasa-br.adapter';
import { mapSibsPt } from './sibs-pt.adapter';

const CONSULTADO = new Date('2026-08-16T12:00:00Z');

/**
 * Cada bloque parte de una respuesta con el formato real del proveedor y comprueba
 * que sale la misma forma canónica. Es el contrato de la capa anticorrupción: seis
 * entradas distintas, una única salida.
 */

describe('OpenBanking ES: camelCase con céntimos enteros', () => {
  const respuesta = {
    subjectId: 'ES-5678',
    currency: 'EUR',
    riskGrade: 'B',
    accountsSummary: {
      totalOutstandingCents: 1_250_000,
      monthlyInstalmentsCents: 34_500,
      activeCreditCount: 3,
      missedPaymentsLast24m: 0,
      oldestAccountOpened: '2015-04-12',
    },
  };

  it('traduce al snapshot canónico', () => {
    expect(mapOpenBankingEs(respuesta, CONSULTADO)).toMatchObject({
      provider: 'openbanking-es',
      country: 'ES',
      currency: 'EUR',
      monthlyDebtPaymentsMinor: 34_500,
      totalDebtMinor: 1_250_000,
      creditScore: 750,
      delinquencies: 0,
      activeLoans: 3,
    });
  });

  it('convierte la calificación por letras a la escala común', () => {
    const mejor = mapOpenBankingEs({ ...respuesta, riskGrade: 'A' }, CONSULTADO);
    const peor = mapOpenBankingEs({ ...respuesta, riskGrade: 'E' }, CONSULTADO);

    expect(mejor.creditScore).toBe(1000);
    expect(peor.creditScore).toBe(0);
  });

  it('admite que no haya fecha de apertura', () => {
    const sinFecha = {
      ...respuesta,
      accountsSummary: { ...respuesta.accountsSummary, oldestAccountOpened: null },
    };

    expect(mapOpenBankingEs(sinFecha, CONSULTADO).oldestAccountOpenedAt).toBeNull();
  });

  it('rechaza una respuesta que no cumple el contrato', () => {
    expect(() => mapOpenBankingEs({ subjectId: 'x' }, CONSULTADO)).toThrow(ProviderContractError);
    expect(() => mapOpenBankingEs({ ...respuesta, riskGrade: 'Z' }, CONSULTADO)).toThrow(
      ProviderContractError,
    );
  });
});

describe('SIBS PT: snake_case con decimales en texto', () => {
  const respuesta = {
    nif: '123456789',
    moeda: 'EUR',
    score_credito: '78.5',
    divida_total: '12500.75',
    prestacao_mensal: '345.20',
    creditos_ativos: 3,
    incidentes: 0,
    primeiro_credito: '2015-04-12',
  };

  it('traduce al snapshot canónico', () => {
    expect(mapSibsPt(respuesta, CONSULTADO)).toMatchObject({
      provider: 'sibs-pt',
      country: 'PT',
      currency: 'EUR',
      monthlyDebtPaymentsMinor: 34_520,
      totalDebtMinor: 1_250_075,
      creditScore: 785,
      delinquencies: 0,
      activeLoans: 3,
    });
  });

  it('rechaza un score que no es numérico', () => {
    expect(() => mapSibsPt({ ...respuesta, score_credito: 'alto' }, CONSULTADO)).toThrow(
      ProviderContractError,
    );
  });

  it('rechaza importes que no vienen como texto decimal', () => {
    expect(() => mapSibsPt({ ...respuesta, divida_total: 12_500.75 }, CONSULTADO)).toThrow(
      ProviderContractError,
    );
  });
});

describe('CBI Globe IT: anidado, dd/MM/yyyy y el resultado en el cuerpo', () => {
  const respuesta = {
    esito: 'OK',
    soggetto: {
      profiloCreditizio: { rating: 7, ratingScala: 10 },
      esposizione: {
        totale: { importo: 18_750.5, divisa: 'EUR' },
        rataMensile: { importo: 420, divisa: 'EUR' },
      },
      rapporti: { attivi: 2, insoluti: 1, primaApertura: '12/04/2015' },
    },
  };

  it('traduce al snapshot canónico', () => {
    expect(mapCbiGlobeIt(respuesta, CONSULTADO)).toMatchObject({
      provider: 'cbi-globe-it',
      country: 'IT',
      currency: 'EUR',
      monthlyDebtPaymentsMinor: 42_000,
      totalDebtMinor: 1_875_050,
      creditScore: 700,
      delinquencies: 1,
      activeLoans: 2,
    });
  });

  it('lee la fecha en dd/MM/yyyy', () => {
    expect(mapCbiGlobeIt(respuesta, CONSULTADO).oldestAccountOpenedAt?.toISOString()).toBe(
      '2015-04-12T00:00:00.000Z',
    );
  });

  it('un esito distinto de OK es un rechazo, aunque el HTTP fuera 200', () => {
    expect(() => mapCbiGlobeIt({ ...respuesta, esito: 'KO' }, CONSULTADO)).toThrow(ProviderRejectedError);
  });

  it('un esito OK sin datos incumple el contrato', () => {
    expect(() => mapCbiGlobeIt({ esito: 'OK' }, CONSULTADO)).toThrow(ProviderContractError);
  });
});

describe('Buró MX: score de 400 a 850 y antigüedad en meses', () => {
  const respuesta = {
    folioConsulta: 'MX-123456',
    scoreBuro: 712,
    resumen: {
      saldoTotalMxn: 45_250,
      pagoMensualMxn: 3_120.5,
      creditosAbiertos: 4,
      atrasosUltimos24Meses: 1,
      antiguedadMeses: 96,
    },
  };

  it('traduce al snapshot canónico', () => {
    expect(mapBuroMx(respuesta, CONSULTADO)).toMatchObject({
      provider: 'buro-mx',
      country: 'MX',
      currency: 'MXN',
      monthlyDebtPaymentsMinor: 312_050,
      totalDebtMinor: 4_525_000,
      creditScore: 693,
      delinquencies: 1,
      activeLoans: 4,
    });
  });

  it('deriva la fecha de apertura a partir de los meses de antigüedad', () => {
    const snapshot = mapBuroMx(respuesta, CONSULTADO);

    expect(snapshot.oldestAccountOpenedAt?.toISOString().slice(0, 7)).toBe('2018-08');
  });

  it('los extremos de la escala del Buró caen en los extremos comunes', () => {
    expect(mapBuroMx({ ...respuesta, scoreBuro: 400 }, CONSULTADO).creditScore).toBe(0);
    expect(mapBuroMx({ ...respuesta, scoreBuro: 850 }, CONSULTADO).creditScore).toBe(1000);
  });
});

describe('DataCrédito CO: sin agregados, hay que derivarlos del detalle', () => {
  const respuesta = {
    numero_documento: '1020304050',
    puntaje: 720,
    deuda_total_cop: 18_500_000,
    obligaciones: [
      {
        entidad: 'Bancolombia',
        cuota_mensual_cop: 450_000,
        estado: 'AL_DIA',
        fecha_apertura: '2015-04-12',
      },
      {
        entidad: 'Davivienda',
        cuota_mensual_cop: 320_000,
        estado: 'MORA',
        fecha_apertura: '2019-08-01',
      },
      {
        entidad: 'BBVA Colombia',
        cuota_mensual_cop: 900_000,
        estado: 'CERRADA',
        fecha_apertura: '2012-01-15',
      },
    ],
  };

  it('suma las cuotas de las obligaciones vivas e ignora las cerradas', () => {
    // (450.000 + 320.000) pesos en centavos; los 900.000 de la cerrada no cuentan.
    expect(mapDataCreditoCo(respuesta, CONSULTADO).monthlyDebtPaymentsMinor).toBe(77_000_000);
  });

  it('cuenta como activas solo las que no están cerradas', () => {
    expect(mapDataCreditoCo(respuesta, CONSULTADO).activeLoans).toBe(2);
  });

  it('cuenta los impagos por estado', () => {
    expect(mapDataCreditoCo(respuesta, CONSULTADO).delinquencies).toBe(1);
  });

  it('la antigüedad cuenta también las obligaciones ya canceladas', () => {
    expect(mapDataCreditoCo(respuesta, CONSULTADO).oldestAccountOpenedAt?.toISOString()).toBe(
      '2012-01-15T00:00:00.000Z',
    );
  });

  it('convierte los pesos enteros a centavos', () => {
    expect(mapDataCreditoCo(respuesta, CONSULTADO).totalDebtMinor).toBe(1_850_000_000);
  });

  it('sin obligaciones no hay cuota ni fecha', () => {
    const vacio = mapDataCreditoCo({ ...respuesta, obligaciones: [] }, CONSULTADO);

    expect(vacio.monthlyDebtPaymentsMinor).toBe(0);
    expect(vacio.activeLoans).toBe(0);
    expect(vacio.oldestAccountOpenedAt).toBeNull();
  });

  it('rechaza un estado de obligación desconocido', () => {
    const raro = {
      ...respuesta,
      obligaciones: [{ ...respuesta.obligaciones[0], estado: 'EN_TRAMITE' }],
    };

    expect(() => mapDataCreditoCo(raro, CONSULTADO)).toThrow(ProviderContractError);
  });
});

describe('Serasa BR: centavos y score que ya está en la escala común', () => {
  const respuesta = {
    cpf: '52998224725',
    score_serasa: 685,
    comprometimento_renda: 0.27,
    dividas: { total_centavos: 1_875_000, parcela_mensal_centavos: 42_000 },
    negativacoes: 0,
    contratos_ativos: 2,
    primeiro_contrato: '2016-03-15',
  };

  it('traduce al snapshot canónico', () => {
    expect(mapSerasaBr(respuesta, CONSULTADO)).toMatchObject({
      provider: 'serasa-br',
      country: 'BR',
      currency: 'BRL',
      monthlyDebtPaymentsMinor: 42_000,
      totalDebtMinor: 1_875_000,
      creditScore: 685,
      delinquencies: 0,
      activeLoans: 2,
    });
  });

  it('ignora el comprometimento_renda que calcula el proveedor', () => {
    const snapshot = mapSerasaBr(respuesta, CONSULTADO);

    expect(Object.keys(snapshot)).not.toContain('comprometimento_renda');
    expect(snapshot).not.toHaveProperty('debtToIncome');
  });
});

describe('forma canónica', () => {
  const casos = [
    mapOpenBankingEs(
      {
        subjectId: 'x',
        currency: 'EUR',
        riskGrade: 'C',
        accountsSummary: {
          totalOutstandingCents: 100,
          monthlyInstalmentsCents: 10,
          activeCreditCount: 1,
          missedPaymentsLast24m: 0,
          oldestAccountOpened: null,
        },
      },
      CONSULTADO,
    ),
    mapSerasaBr(
      {
        cpf: 'x',
        score_serasa: 500,
        dividas: { total_centavos: 100, parcela_mensal_centavos: 10 },
        negativacoes: 0,
        contratos_ativos: 1,
        primeiro_contrato: null,
      },
      CONSULTADO,
    ),
  ];

  it('todos los proveedores producen las mismas claves', () => {
    const claves = casos.map((snapshot) => Object.keys(snapshot).sort());

    expect(claves[0]).toEqual(claves[1]);
  });

  it('el score siempre cae dentro de la escala común', () => {
    for (const snapshot of casos) {
      expect(snapshot.creditScore).toBeGreaterThanOrEqual(0);
      expect(snapshot.creditScore).toBeLessThanOrEqual(1000);
    }
  });

  it('se conserva la respuesta cruda para poder auditarla', () => {
    for (const snapshot of casos) {
      expect(snapshot.raw).toBeTypeOf('object');
    }
  });
});
