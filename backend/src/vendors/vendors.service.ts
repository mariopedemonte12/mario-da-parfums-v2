import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import { and, count, eq, ilike } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.module.js';
import type { Database } from '../database/database.module.js';
import { vendors } from '../database/schema/vendor.schema.js';
import type { Vendor } from './entities/vendor.entity.js';
import { CreateVendorDto } from './dto/create-vendor.dto.js';
import { UpdateVendorItemDto } from './dto/batch-update-vendors.dto.js';
import { FindVendorsDto } from './dto/find-vendors.dto.js';
import { BatchItemResultDto } from './dto/batch-result.dto.js';

interface PgError {
  code?: string;
}

function isPgError(err: unknown): err is PgError {
  return typeof err === 'object' && err !== null && 'code' in err;
}

// drizzle-orm (0.45.x) wraps every real driver error in a DrizzleQueryError
// whose own `.code` is undefined — the pg error (with the actual SQLSTATE)
// lives on `.cause`. Unwrap both shapes so real unique/FK violations are
// recognized instead of always falling through to "Unexpected error".
function getPgErrorCode(err: unknown): string | undefined {
  if (isPgError(err) && err.code) return err.code;
  if (err && typeof err === 'object' && 'cause' in err) {
    const cause = (err as { cause?: unknown }).cause;
    if (isPgError(cause)) return cause.code;
  }
  return undefined;
}

function describeWriteError(err: unknown): string {
  const code = getPgErrorCode(err);
  if (code === '23505') return 'A vendor with that name already exists';
  if (code === '23503') return 'Vendor is referenced by existing listings';
  return 'Unexpected error';
}

// Per-item schema validation, run manually instead of via the global
// ValidationPipe: a batch item that fails class-validator (e.g. an empty
// name) must only fail that item, per the spec's partial-success
// semantics — the pipe validating the whole `items` array up front would
// otherwise reject the entire batch for one bad item. class-validator's
// `validate()` refuses anything that isn't an instance of a decorated
// class, so the item (a plain object in this service's unit tests; already
// a class instance in production, via the pipe's @Type()) is always run
// through `plainToInstance` first to get real class-validator metadata.
async function describeValidationError<T extends object>(
  cls: ClassConstructor<T>,
  item: T,
): Promise<string | undefined> {
  const errors = await validate(plainToInstance(cls, item));
  if (errors.length === 0) return undefined;

  const codes = errors.flatMap((error) =>
    Object.values(error.constraints ?? {}).flatMap((message) => {
      try {
        const parsed = JSON.parse(message);
        return (Array.isArray(parsed) ? parsed : [parsed]).map(
          (item: { code: string }) => item.code,
        );
      } catch {
        return [message];
      }
    }),
  );
  return `Validation failed: ${codes.join(', ')}`;
}

@Injectable()
export class VendorsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findAll(
    query: FindVendorsDto,
  ): Promise<{ data: Vendor[]; total: number }> {
    const conditions = [];
    if (query.name) conditions.push(ilike(vendors.name, `%${query.name}%`));
    if (query.websiteUrl)
      conditions.push(ilike(vendors.websiteUrl, `%${query.websiteUrl}%`));
    const where = conditions.length ? and(...conditions) : undefined;

    const offset = (query.page - 1) * query.limit;

    const [data, totalRows] = await Promise.all([
      this.db
        .select()
        .from(vendors)
        .where(where)
        .limit(query.limit)
        .offset(offset),
      this.db.select({ value: count() }).from(vendors).where(where),
    ]);

    return { data, total: totalRows[0]?.value ?? 0 };
  }

  async findOne(id: number): Promise<Vendor> {
    const [vendor] = await this.db
      .select()
      .from(vendors)
      .where(eq(vendors.id, id));
    if (!vendor) {
      throw new NotFoundException(`Vendor ${id} not found`);
    }
    return vendor;
  }

  async createMany(items: CreateVendorDto[]): Promise<BatchItemResultDto[]> {
    const results: BatchItemResultDto[] = [];

    for (const item of items) {
      const validationError = await describeValidationError(
        CreateVendorDto,
        item,
      );
      if (validationError) {
        results.push({ success: false, error: validationError });
        continue;
      }

      try {
        const [vendor] = await this.db.insert(vendors).values(item).returning();
        results.push({ id: vendor.id, success: true });
      } catch (err) {
        results.push({ success: false, error: describeWriteError(err) });
      }
    }

    return results;
  }

  async updateMany(
    items: UpdateVendorItemDto[],
  ): Promise<BatchItemResultDto[]> {
    const results: BatchItemResultDto[] = [];

    for (const item of items) {
      const { id, ...changes } = item;

      const validationError = await describeValidationError(
        UpdateVendorItemDto,
        item,
      );
      if (validationError) {
        results.push({ id, success: false, error: validationError });
        continue;
      }

      try {
        const [vendor] = await this.db
          .update(vendors)
          .set(changes)
          .where(eq(vendors.id, id))
          .returning();
        if (!vendor) {
          results.push({ id, success: false, error: 'Vendor not found' });
          continue;
        }
        results.push({ id: vendor.id, success: true });
      } catch (err) {
        results.push({ id, success: false, error: describeWriteError(err) });
      }
    }

    return results;
  }

  async removeMany(ids: number[]): Promise<BatchItemResultDto[]> {
    const results: BatchItemResultDto[] = [];

    for (const id of ids) {
      try {
        const [vendor] = await this.db
          .delete(vendors)
          .where(eq(vendors.id, id))
          .returning();
        if (!vendor) {
          results.push({ id, success: false, error: 'Vendor not found' });
          continue;
        }
        results.push({ id, success: true });
      } catch (err) {
        results.push({ id, success: false, error: describeWriteError(err) });
      }
    }

    return results;
  }
}
