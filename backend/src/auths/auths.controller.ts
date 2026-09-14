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

  // Stateless JWT session: there's no server-side record to revoke, so
  // "logout" is just expiring the httpOnly cookie the browser holds — see
  // specs/auth-pages.md ("POST /auths/logout does not exist").
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(SESSION_COOKIE_NAME, this.cookieOptions());
    return {};
  }

  // Session credential travels only via httpOnly cookie, never in the
  // response body — see specs/auth-pages.md ("Contract assumption").
  private setSessionCookie(res: Response, accessToken: string) {
    res.cookie(SESSION_COOKIE_NAME, accessToken, this.cookieOptions());
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      sameSite: 'lax' as const,
      secure: process.env.NODE_ENV === 'production',
    };
  }
}
