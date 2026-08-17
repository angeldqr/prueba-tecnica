import { profileFor, scaleQuality } from './profile';

/**
 * Cada proveedor devuelve el perfil en su propio formato. Las diferencias no son
 * decorativas: camelCase frente a snake_case, céntimos enteros frente a decimales en
 * texto, estructuras anidadas, fechas dd/MM/yyyy y escalas de score distintas. Es lo
 * que obliga a que la traducción del lado de la API sea real.
 */
export type ResponseBuilder = (document: string) => unknown;

const RISK_GRADES = ['E', 'D', 'C', 'B', 'A'] as const;

/** Céntimos enteros, camelCase. */
export const buildSpain: ResponseBuilder = (document) => {
  const profile = profileFor(document, 'es');
  const grade = RISK_GRADES[Math.min(RISK_GRADES.length - 1, Math.floor(profile.quality * 5))];

  return {
    subjectId: `ES-${document.slice(-4)}`,
    currency: 'EUR',
    riskGrade: grade,
    accountsSummary: {
      totalOutstandingCents: profile.totalDebt * 100,
      monthlyInstalmentsCents: profile.monthlyPayment * 100,
      activeCreditCount: profile.activeLoans,
      missedPaymentsLast24m: profile.delinquencies,
      oldestAccountOpened: profile.firstCreditAt,
    },
  };
};

/** Decimales en texto, snake_case, score de 0 a 100. */
export const buildPortugal: ResponseBuilder = (document) => {
  const profile = profileFor(document, 'pt');

  return {
    nif: document,
    moeda: 'EUR',
    score_credito: scaleQuality(profile.quality, 0, 100).toFixed(1),
    divida_total: profile.totalDebt.toFixed(2),
    prestacao_mensal: profile.monthlyPayment.toFixed(2),
    creditos_ativos: profile.activeLoans,
    incidentes: profile.delinquencies,
    primeiro_credito: profile.firstCreditAt,
  };
};

/** Anidado, fechas dd/MM/yyyy y el resultado en un campo `esito`, no en el código HTTP. */
export const buildItaly: ResponseBuilder = (document) => {
  const profile = profileFor(document, 'it');
  const [year, month, day] = profile.firstCreditAt.split('-');

  return {
    esito: 'OK',
    soggetto: {
      profiloCreditizio: {
        rating: scaleQuality(profile.quality, 1, 10),
        ratingScala: 10,
      },
      esposizione: {
        totale: { importo: Number(profile.totalDebt.toFixed(2)), divisa: 'EUR' },
        rataMensile: { importo: Number(profile.monthlyPayment.toFixed(2)), divisa: 'EUR' },
      },
      rapporti: {
        attivi: profile.activeLoans,
        insoluti: profile.delinquencies,
        primaApertura: `${day}/${month}/${year}`,
      },
    },
  };
};

/** Score de 400 a 850 y la antigüedad en meses en vez de la fecha. */
export const buildMexico: ResponseBuilder = (document) => {
  const profile = profileFor(document, 'mx');
  const apertura = new Date(`${profile.firstCreditAt}T00:00:00Z`);
  const meses = Math.max(0, Math.round((Date.now() - apertura.getTime()) / (1000 * 60 * 60 * 24 * 30.44)));

  return {
    folioConsulta: `MX-${document.slice(-6)}`,
    scoreBuro: scaleQuality(profile.quality, 400, 850),
    resumen: {
      saldoTotalMxn: Number(profile.totalDebt.toFixed(2)),
      pagoMensualMxn: Number(profile.monthlyPayment.toFixed(2)),
      creditosAbiertos: profile.activeLoans,
      atrasosUltimos24Meses: profile.delinquencies,
      antiguedadMeses: meses,
    },
  };
};

/** Sin agregados: el detalle obligación por obligación, en pesos enteros. */
export const buildColombia: ResponseBuilder = (document) => {
  const profile = profileFor(document, 'co');
  const entidades = ['Bancolombia', 'Davivienda', 'BBVA Colombia', 'Banco de Bogotá'];

  const obligaciones = Array.from({ length: Math.max(1, profile.activeLoans) }, (_, index) => {
    const enMora = index < profile.delinquencies;

    return {
      entidad: entidades[index % entidades.length],
      cuota_mensual_cop: Math.round(profile.monthlyPayment / Math.max(1, profile.activeLoans)),
      estado: enMora ? 'MORA' : 'AL_DIA',
      fecha_apertura: profile.firstCreditAt,
    };
  });

  return {
    numero_documento: document,
    puntaje: scaleQuality(profile.quality, 150, 950),
    deuda_total_cop: profile.totalDebt,
    obligaciones,
  };
};

/** Centavos enteros y score que ya viene de 0 a 1000. */
export const buildBrazil: ResponseBuilder = (document) => {
  const profile = profileFor(document, 'br');

  return {
    cpf: document,
    score_serasa: scaleQuality(profile.quality, 0, 1000),
    comprometimento_renda: Number((0.1 + (1 - profile.quality) * 0.4).toFixed(2)),
    dividas: {
      total_centavos: profile.totalDebt * 100,
      parcela_mensal_centavos: profile.monthlyPayment * 100,
    },
    negativacoes: profile.delinquencies,
    contratos_ativos: profile.activeLoans,
    primeiro_contrato: profile.firstCreditAt,
  };
};

export const ROUTES: Readonly<Record<string, { field: string; build: ResponseBuilder }>> = {
  '/providers/es/credit-profile': { field: 'documentNumber', build: buildSpain },
  '/providers/pt/consulta-credito': { field: 'nif', build: buildPortugal },
  '/providers/it/posizione-creditizia': { field: 'codiceFiscale', build: buildItaly },
  '/providers/mx/reporte-credito': { field: 'curp', build: buildMexico },
  '/providers/co/historial-crediticio': { field: 'numero_documento', build: buildColombia },
  '/providers/br/consulta-serasa': { field: 'cpf', build: buildBrazil },
};
