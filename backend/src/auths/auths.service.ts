import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { plainToInstance } from 'class-transformer';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { AdminCreateUserDto } from './dto/admin-create-user.dto.js';
import { UsersService } from '../users/users.service.js';
import { PasswordsService } from '../passwords/passwords.service.js';
import { UserResponseDto } from '../users/dto/response-user.dto.js';
import type { User } from '../database/schema/user.schema.js';
import { Role } from '../shared/enums/role.enums.js';
import {
  getPgErrorCode,
  getPgErrorConstraint,
} from '../common/utils/pg-error.util.js';

@Injectable()
export class AuthsService {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordsService: PasswordsService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await this.passwordsService.hash(dto.password);

    let user: User;
    try {
      user = await this.usersService.create({
        name: dto.name,
        email: dto.email,
        passwordHash,
        role: Role.USER,
      });
    } catch (err) {
      if (getPgErrorCode(err) === '23505') {
        throw new ConflictException(this.conflictMessage(err));
      }
      throw err;
    }

    return this.buildAuthResponse(user);
  }

  // Admin-only account creation — the only path that can set `role`
  // (public `register` always forces Role.USER). No accessToken is issued
  // here: this isn't the created user logging in, it's an admin acting on
  // their behalf.
  async adminCreate(dto: AdminCreateUserDto) {
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await this.passwordsService.hash(dto.password);

    let user: User;
    try {
      user = await this.usersService.create({
        name: dto.name,
        email: dto.email,
        passwordHash,
        role: dto.role,
      });
    } catch (err) {
      if (getPgErrorCode(err) === '23505') {
        throw new ConflictException(this.conflictMessage(err));
      }
      throw err;
    }

    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmail(dto.email);
    const isValid = user
      ? await this.passwordsService.verify(user.passwordHash, dto.password)
      : false;

    if (!user || !isValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.buildAuthResponse(user);
  }

  // `users.name` and `users.email` are both unique, so a 23505 from the
  // db-level check (the optimistic findByEmail check above already covers
  // the email case in the common path) needs the constraint name to report
  // which column actually collided instead of always blaming the email.
  private conflictMessage(err: unknown): string {
    if (getPgErrorConstraint(err) === 'users_name_unique') {
      return 'Name already taken';
    }
    return 'Email already registered';
  }

  private buildAuthResponse(user: User) {
    const accessToken = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    const userDto = plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });
    return { accessToken, user: userDto };
  }
}
