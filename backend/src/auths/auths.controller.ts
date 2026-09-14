import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthsService } from './auths.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { AdminCreateUserDto } from './dto/admin-create-user.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../shared/enums/role.enums.js';
import { SESSION_COOKIE_NAME } from './constants.js';

@Controller('auths')
export class AuthsController {
  constructor(private readonly authsService: AuthsService) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, user } = await this.authsService.register(dto);
    this.setSessionCookie(res, accessToken);
    return { user };
  }

  @Post('admin-register')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  adminRegister(@Body() dto: AdminCreateUserDto) {
    return this.authsService.adminCreate(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, user } = await this.authsService.login(dto);
    this.setSessionCookie(res, accessToken);
    return { user };
  }

  // Session credential travels only via httpOnly cookie, never in the
  // response body — see specs/auth-pages.md ("Contract assumption").
  private setSessionCookie(res: Response, accessToken: string) {
    res.cookie(SESSION_COOKIE_NAME, accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  }
}
