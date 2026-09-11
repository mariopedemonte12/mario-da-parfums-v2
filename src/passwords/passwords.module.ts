import { Module } from '@nestjs/common';
import { PasswordsService } from './passwords.service.js';

@Module({
  providers: [PasswordsService],
  exports: [PasswordsService]
})
export class PasswordsModule {}
