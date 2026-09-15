import {
  ConflictException,
  Inject,
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
import { DRIZZLE } from '../database/database.module.js';
import type { Database } from '../database/database.module.js';
import {
  getPgErrorCode,
  getPgErrorConstraint,
} from '../common/utils/pg-error.util.js';

// users.name and users.email each have their own unique constraint
// (database/schema/user.schema.ts) — the 23505 handler below reports which
// one actually collided instead of always blaming email.
const USERS_NAME_UNIQUE_CONSTRAINT = 'users_name_unique';
const USERS_EMAIL_UNIQUE_CONSTRAINT = 'users_email_unique';

@Injectable()
export class AuthsService {
  constructor(
    private readonly usersService: UsersService,
    private readonly passwordsService: PasswordsService,
    private readonly jwtService: JwtService,
    @Inject(DRIZZLE) private readonly db: Database,
  ) {}

  // Runs the insert and the JWT signing in one db transaction: user.id is
  // only known after the insert (serial PK), so the JWT can't be signed
  // first, but wrapping both in a transaction gets the same guarantee —
  // if signing throws (e.g. a misconfigured JWT_SECRET), the insert is
  // rolled back instead of leaving an orphaned user row the caller was
  // never told about. A failure in the insert itself (e.g. a 23505 the
  // optimistic findByEmail check above missed) still propagates as before.
  async register(dto: RegisterDto) {
    const existingUser = await this.usersService.findByEmail(dto.email);
    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await this.passwordsService.hash(dto.password);

    return this.db.transaction(async (tx) => {
      let user: User;
      try {
        user = await this.usersService.create(
          {
            name: dto.name,
            email: dto.email,
            passwordHash,
            role: Role.USER,
          },
          tx,
        );
      } catch (err) {
        this.throwIfUniqueViolation(err);
        throw err;
      }

      return this.buildAuthResponse(user);
    });
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
      this.throwIfUniqueViolation(err);
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

  // Only throws (never returns) when err is actually a 23505; otherwise
  // callers fall through and rethrow the original error unchanged.
  private throwIfUniqueViolation(err: unknown): void {
    if (getPgErrorCode(err) !== '23505') return;

    switch (getPgErrorConstraint(err)) {
      case USERS_EMAIL_UNIQUE_CONSTRAINT:
        throw new ConflictException('Email already registered');
      case USERS_NAME_UNIQUE_CONSTRAINT:
        throw new ConflictException('Name already taken');
      default:
        throw new ConflictException(
          'A user with that name or email already exists',
        );
    }
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
