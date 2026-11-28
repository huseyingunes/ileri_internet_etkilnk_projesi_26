import { Module } from '@nestjs/common';
import { SecurityReportsController } from './security-reports.controller.js';

@Module({ controllers: [SecurityReportsController] })
export class SecurityReportsModule {}
