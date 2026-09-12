import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthsService } from './auths.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { AdminCreateUserDto } from './dto/admin-create-user.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../shared/enums/role.enums.js';

@Controller('auths')
export class AuthsController {
  constructor(private readonly authsService: AuthsService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authsService.register(dto);
  }

  @Post('admin-register')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  adminRegister(@Body() dto: AdminCreateUserDto) {
    return this.authsService.adminCreate(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authsService.login(dto);
  }
}
