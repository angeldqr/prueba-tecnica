import { Controller, Get, HttpStatus, Res, VERSION_NEUTRAL } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../../shared/infrastructure/prisma';

type CheckResult = 'ok' | 'down';

/**
 * Dos sondas con propósitos distintos: `live` dice si el proceso sigue en pie y
 * `ready` si puede atender tráfico. Kubernetes reinicia con la primera y saca del
 * balanceo con la segunda, así que confundirlas provoca reinicios en cascada
 * cuando lo que falla es una dependencia.
 *
 * Sin versión ni prefijo: las sondas del orquestador no deberían moverse porque la
 * API saque una v2.
 */
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(private readonly prisma: PrismaService) {}

  @Get('live')
  live(): { status: 'ok'; uptimeSeconds: number } {
    return { status: 'ok', uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000) };
  }

  @Get('ready')
  async ready(
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ status: CheckResult; checks: Record<string, CheckResult> }> {
    const checks: Record<string, CheckResult> = {
      postgres: (await this.prisma.isReachable()) ? 'ok' : 'down',
    };

    const healthy = Object.values(checks).every((check) => check === 'ok');

    // Un 200 con "down" dentro del cuerpo no saca el pod del balanceo: la sonda de
    // Kubernetes mira el código de estado.
    response.status(healthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);

    return { status: healthy ? 'ok' : 'down', checks };
  }
}
