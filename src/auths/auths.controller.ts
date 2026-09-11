import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthsService } from './auths.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';

@Controller('auths')
export class AuthsController {
  constructor(private readonly authsService: AuthsService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authsService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authsService.login(dto);
  }
}
