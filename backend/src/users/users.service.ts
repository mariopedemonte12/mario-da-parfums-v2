import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, eq, ilike } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.module.js';
import type { Database } from '../database/database.module.js';
import {
  users,
  type User,
  type NewUser,
} from '../database/schema/user.schema.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { FindUsersDto } from './dto/find-users.dto.js';
import { getPgErrorCode } from '../common/utils/pg-error.util.js';

@Injectable()
export class UsersService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findByEmail(email: string): Promise<User | undefined> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .execute();
    return user;
  }

  async create(data: NewUser): Promise<User> {
    const [user] = await this.db.insert(users).values(data).returning();
    return user;
  }

  async findAll(query: FindUsersDto): Promise<{ data: User[]; total: number }> {
    const conditions = [];
    if (query.name) conditions.push(ilike(users.name, `%${query.name}%`));
    if (query.email) conditions.push(ilike(users.email, `%${query.email}%`));
    if (query.role) conditions.push(eq(users.role, query.role));
    const where = conditions.length ? and(...conditions) : undefined;

    const offset = (query.page - 1) * query.limit;

    const [data, totalRows] = await Promise.all([
      this.db
        .select()
        .from(users)
        .where(where)
        .orderBy(asc(users.id))
        .limit(query.limit)
        .offset(offset),
      this.db.select({ value: count() }).from(users).where(where),
    ]);

    return { data, total: totalRows[0]?.value ?? 0 };
  }

  async findOne(id: number): Promise<User> {
    const [user] = await this.db.select().from(users).where(eq(users.id, id));
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }

  async update(id: number, dto: UpdateUserDto): Promise<User> {
    // A dto with nothing to set (a PATCH with no fields, or one whose only
    // fields were stripped by the validation pipe's whitelist) has no
    // meaningful updates; Drizzle's `.set({})` builds an invalid empty SQL
    // SET clause. `Object.keys` alone isn't enough to detect this: with
    // this project's `target: ES2023`, class field declarations without an
    // initializer (e.g. `name?: string;`) are still own enumerable
    // properties set to `undefined`, so an UpdateUserDto instance always
    // has all its declared keys present. Check values instead.
    const hasUpdates = Object.values(dto).some((value) => value !== undefined);
    if (!hasUpdates) {
      return this.findOne(id);
    }

    try {
      const [user] = await this.db
        .update(users)
        .set(dto)
        .where(eq(users.id, id))
        .returning();
      if (!user) {
        throw new NotFoundException(`User ${id} not found`);
      }
      return user;
    } catch (err) {
      if (getPgErrorCode(err) === '23505') {
        throw new ConflictException(
          'A user with that name or email already exists',
        );
      }
      throw err;
    }
  }

  async remove(id: number): Promise<void> {
    const [user] = await this.db
      .delete(users)
      .where(eq(users.id, id))
      .returning();
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
  }
}
