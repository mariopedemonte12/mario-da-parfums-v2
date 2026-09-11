import { Module } from '@nestjs/common';
import { AuthsService } from './auths.service.js';
import { AuthsController } from './auths.controller.js';
import { UsersModule } from '../users/users.module.js';
import { PasswordsModule } from '../passwords/passwords.module.js';
import { JwtConfigModule } from './jwt-config.module.js';

@Module({
  imports: [UsersModule, PasswordsModule, JwtConfigModule],
  controllers: [AuthsController],
  providers: [AuthsService],
})
export class AuthsModule {}
