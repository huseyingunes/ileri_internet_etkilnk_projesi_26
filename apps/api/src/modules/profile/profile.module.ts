import { Module } from '@nestjs/common';
import { CommunitiesModule } from '../communities/communities.module.js';
import { MeController } from './me.controller.js';

/** Composes the caller's profile from the identity and communities modules. */
@Module({
  imports: [CommunitiesModule],
  controllers: [MeController],
})
export class ProfileModule {}
