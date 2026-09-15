import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { CookieOptions, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
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

  // Stricter than the global ThrottlerGuard limit — these are the
  // brute-forceable endpoints (see specs/security-hardening.md, §1).
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
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

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
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

  // No guard: logging out is idempotent whether or not the caller currently
  // holds a valid (or any) session cookie. Nothing to return — the
  // frontend's logout() discards the response body (see
  // specs/auth-pages.md, "POST /auths/logout does not exist").
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE_NAME, AuthsController.COOKIE_OPTIONS);
  }

  // Attributes shared by every Set-Cookie for the session cookie — clearing
  // it (res.clearCookie) must use the same httpOnly/sameSite/secure the
  // cookie was originally set with, or the browser won't recognize it as
  // the same cookie and it won't actually be deleted.
  private static readonly COOKIE_OPTIONS: CookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  };

  // Session credential travels only via httpOnly cookie, never in the
  // response body — see specs/auth-pages.md ("Contract assumption").
  private setSessionCookie(res: Response, accessToken: string) {
    res.cookie(
      SESSION_COOKIE_NAME,
      accessToken,
      AuthsController.COOKIE_OPTIONS,
    );
  }
}
