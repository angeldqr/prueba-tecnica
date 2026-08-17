import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { BankProvidersModule } from './modules/bank-providers/bank-providers.module';
import { CountriesModule } from './modules/countries/countries.module';
import { HealthModule } from './modules/health/health.module';
import { AppConfigModule } from './shared/infrastructure/config/config.module';
import { LoggingModule } from './shared/infrastructure/logging';
import { PrismaModule } from './shared/infrastructure/prisma';
import { DomainExceptionFilter } from './shared/http';

@Module({
  imports: [AppConfigModule, LoggingModule, PrismaModule, HealthModule, CountriesModule, BankProvidersModule],
  providers: [{ provide: APP_FILTER, useClass: DomainExceptionFilter }],
})
export class AppModule {}
