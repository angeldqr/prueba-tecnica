import {
  CREDIT_APPLICATION_STATUSES,
  TERMINAL_STATUSES,
  type CreditApplicationStatus,
} from '@bravo/contracts';
import { describe, expect, it } from 'vitest';
import { allowedTransitionsFrom, checkTransition } from './state-machine';
import { ACTORS, TRANSITIONS, isReviewTarget, type Actor } from './transitions';

function puede(
  from: CreditApplicationStatus,
  to: CreditApplicationStatus,
  actor: Actor = 'system',
  reviewState: 'MANUAL_REVIEW' | 'ADDITIONAL_REVIEW' | 'COMPLIANCE_REVIEW' = 'MANUAL_REVIEW',
) {
  return checkTransition({ from, to, actor, reviewState });
}

describe('integridad de la tabla de transiciones', () => {
  it('declara todos los estados, sin dejarse ninguno', () => {
    expect(Object.keys(TRANSITIONS).sort()).toEqual([...CREDIT_APPLICATION_STATUSES].sort());
  });

  it('los estados finales no tienen salida', () => {
    for (const status of TERMINAL_STATUSES) {
      expect(TRANSITIONS[status], status).toEqual([]);
    }
  });

  it('los estados no finales tienen al menos una salida', () => {
    for (const status of CREDIT_APPLICATION_STATUSES) {
      if ((TERMINAL_STATUSES as readonly string[]).includes(status)) continue;

      expect(TRANSITIONS[status].length, status).toBeGreaterThan(0);
    }
  });

  it('ninguna transición se declara dos veces', () => {
    for (const status of CREDIT_APPLICATION_STATUSES) {
      const destinos = TRANSITIONS[status].map((rule) => rule.to);

      expect(new Set(destinos).size, status).toBe(destinos.length);
    }
  });

  it('toda transición tiene al menos un actor que pueda ejecutarla', () => {
    for (const status of CREDIT_APPLICATION_STATUSES) {
      for (const rule of TRANSITIONS[status]) {
        expect(rule.actors.length, `${status} -> ${rule.to}`).toBeGreaterThan(0);
        expect(rule.actors.every((actor) => ACTORS.includes(actor))).toBe(true);
      }
    }
  });

  it('ningún estado permite quedarse donde está', () => {
    for (const status of CREDIT_APPLICATION_STATUSES) {
      expect(
        TRANSITIONS[status].some((rule) => rule.to === status),
        status,
      ).toBe(false);
    }
  });

  it('todos los estados son alcanzables desde DRAFT', () => {
    const vistos = new Set<CreditApplicationStatus>(['DRAFT']);
    const cola: CreditApplicationStatus[] = ['DRAFT'];

    while (cola.length > 0) {
      const actual = cola.shift() as CreditApplicationStatus;

      for (const rule of TRANSITIONS[actual]) {
        if (vistos.has(rule.to)) continue;
        vistos.add(rule.to);
        cola.push(rule.to);
      }
    }

    expect([...vistos].sort()).toEqual([...CREDIT_APPLICATION_STATUSES].sort());
  });
});

describe('checkTransition', () => {
  it('acepta el camino feliz completo', () => {
    const camino: Array<[CreditApplicationStatus, CreditApplicationStatus, Actor]> = [
      ['DRAFT', 'SUBMITTED', 'applicant'],
      ['SUBMITTED', 'BANK_DATA_PENDING', 'system'],
      ['BANK_DATA_PENDING', 'BANK_DATA_RECEIVED', 'system'],
      ['BANK_DATA_RECEIVED', 'RISK_EVALUATING', 'system'],
      ['RISK_EVALUATING', 'AUTO_APPROVED', 'system'],
      ['AUTO_APPROVED', 'APPROVED', 'system'],
      ['APPROVED', 'DISBURSED', 'admin'],
    ];

    for (const [from, to, actor] of camino) {
      expect(puede(from, to, actor), `${from} -> ${to}`).toEqual({ allowed: true });
    }
  });

  it('rechaza saltarse pasos', () => {
    expect(puede('DRAFT', 'APPROVED', 'admin')).toMatchObject({
      allowed: false,
      reason: 'NOT_ALLOWED',
    });
    expect(puede('SUBMITTED', 'DISBURSED', 'admin')).toMatchObject({ reason: 'NOT_ALLOWED' });
  });

  it('un estado final no admite nada, ni siquiera para un admin', () => {
    for (const status of TERMINAL_STATUSES) {
      expect(puede(status, 'APPROVED', 'admin'), status).toMatchObject({
        allowed: false,
        reason: 'TERMINAL',
      });
    }
  });

  it('el solicitante no aprueba su propio crédito', () => {
    expect(puede('MANUAL_REVIEW', 'APPROVED', 'applicant')).toMatchObject({
      allowed: false,
      reason: 'ACTOR_NOT_PERMITTED',
    });
  });

  it('el analista no desembolsa', () => {
    expect(puede('APPROVED', 'DISBURSED', 'analyst')).toMatchObject({
      allowed: false,
      reason: 'ACTOR_NOT_PERMITTED',
    });
  });

  it('el solicitante sí puede retirar la solicitud', () => {
    expect(puede('SUBMITTED', 'CANCELLED', 'applicant').allowed).toBe(true);
    expect(puede('APPROVED', 'CANCELLED', 'applicant').allowed).toBe(true);
  });

  it('caducar es cosa del sistema, no de una persona', () => {
    expect(puede('MANUAL_REVIEW', 'EXPIRED', 'system').allowed).toBe(true);
    expect(puede('MANUAL_REVIEW', 'EXPIRED', 'admin')).toMatchObject({
      reason: 'ACTOR_NOT_PERMITTED',
    });
  });
});

describe('el flujo de revisión depende del país', () => {
  it('España deriva a revisión adicional y no a las otras dos', () => {
    expect(puede('RISK_EVALUATING', 'ADDITIONAL_REVIEW', 'system', 'ADDITIONAL_REVIEW').allowed).toBe(true);
    expect(puede('RISK_EVALUATING', 'MANUAL_REVIEW', 'system', 'ADDITIONAL_REVIEW')).toMatchObject({
      allowed: false,
      reason: 'REVIEW_STATE_NOT_IN_COUNTRY_FLOW',
    });
  });

  it('Brasil deriva a cumplimiento', () => {
    expect(puede('RISK_EVALUATING', 'COMPLIANCE_REVIEW', 'system', 'COMPLIANCE_REVIEW').allowed).toBe(true);
    expect(puede('RISK_EVALUATING', 'ADDITIONAL_REVIEW', 'system', 'COMPLIANCE_REVIEW')).toMatchObject({
      reason: 'REVIEW_STATE_NOT_IN_COUNTRY_FLOW',
    });
  });

  it('el resto usa la revisión manual corriente', () => {
    expect(puede('RISK_EVALUATING', 'MANUAL_REVIEW', 'system', 'MANUAL_REVIEW').allowed).toBe(true);
    expect(puede('RISK_EVALUATING', 'COMPLIANCE_REVIEW', 'system', 'MANUAL_REVIEW')).toMatchObject({
      reason: 'REVIEW_STATE_NOT_IN_COUNTRY_FLOW',
    });
  });

  it('la restricción no afecta a las transiciones que salen de un estado de revisión', () => {
    // Un expediente ya en COMPLIANCE_REVIEW se aprueba igual aunque se pregunte con
    // otro reviewState: la restricción es sobre a dónde deriva la evaluación.
    expect(puede('COMPLIANCE_REVIEW', 'APPROVED', 'analyst', 'MANUAL_REVIEW').allowed).toBe(true);
  });

  it('los tres destinos de revisión están sujetos a la restricción', () => {
    for (const status of CREDIT_APPLICATION_STATUSES) {
      if (!isReviewTarget(status)) continue;

      expect(puede('RISK_EVALUATING', status, 'system', 'MANUAL_REVIEW').allowed).toBe(
        status === 'MANUAL_REVIEW',
      );
    }
  });
});

describe('allowedTransitionsFrom', () => {
  it('un estado final no ofrece ninguna', () => {
    expect(allowedTransitionsFrom('DISBURSED', 'admin', 'MANUAL_REVIEW')).toEqual([]);
  });

  it('el analista solo ve lo que puede hacer', () => {
    expect(allowedTransitionsFrom('MANUAL_REVIEW', 'analyst', 'MANUAL_REVIEW')).toEqual([
      'APPROVED',
      'REJECTED',
    ]);
  });

  it('el admin ve además la cancelación', () => {
    expect(allowedTransitionsFrom('MANUAL_REVIEW', 'admin', 'MANUAL_REVIEW')).toEqual([
      'APPROVED',
      'REJECTED',
      'CANCELLED',
    ]);
  });

  it('filtra los estados de revisión que no son del país', () => {
    const españa = allowedTransitionsFrom('RISK_EVALUATING', 'system', 'ADDITIONAL_REVIEW');

    expect(españa).toContain('ADDITIONAL_REVIEW');
    expect(españa).not.toContain('MANUAL_REVIEW');
    expect(españa).not.toContain('COMPLIANCE_REVIEW');
  });

  it('lo que ofrece es exactamente lo que checkTransition acepta', () => {
    for (const from of CREDIT_APPLICATION_STATUSES) {
      for (const actor of ACTORS) {
        for (const destino of allowedTransitionsFrom(from, actor, 'MANUAL_REVIEW')) {
          expect(puede(from, destino, actor).allowed, `${from} -> ${destino} como ${actor}`).toBe(true);
        }
      }
    }
  });
});
