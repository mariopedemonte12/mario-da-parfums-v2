import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import { and, count, eq, ilike } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.module.js';
import type { Database } from '../database/database.module.js';
import { vendors } from '../database/schema/vendor.schema.js';
import { parseConstraintMessage } from '../validators/helpers/parse-constraint-message.js';
import type { Vendor } from './entities/vendor.entity.js';
import { CreateVendorDto } from './dto/create-vendor.dto.js';
import { UpdateVendorItemDto } from './dto/batch-update-vendors.dto.js';
import { FindVendorsDto } from './dto/find-vendors.dto.js';
import { BatchItemResultDto } from './dto/batch-result.dto.js';
import { getPgErrorCode } from '../common/utils/pg-error.util.js';
import { containsPattern } from '../common/utils/sql-like.util.js';

function describeWriteError(err: unknown): string {
  const code = getPgErrorCode(err);
  if (code === '23505') return 'A vendor with that name already exists';
  if (code === '23503') return 'Vendor is referenced by existing listings';
  return 'Unexpected error';
}

type SanitizeResult<T> = { error: string } | { error?: undefined; value: T };

// Per-item schema validation AND sanitization, run manually instead of via
// the global ValidationPipe: a batch item that fails class-validator (e.g.
// an empty name) must only fail that item, per the spec's partial-success
// semantics — the pipe validating the whole `items` array up front would
// otherwise reject the entire batch for one bad item (see
// batch-create-vendors.dto.ts / batch-update-vendors.dto.ts, which
// deliberately drop @ValidateNested for this reason).
//
// Dropping @ValidateNested also drops the global pipe's whitelist
// stripping for these nested items (whitelist stripping is driven by
// class-validator walking into @ValidateNested children — an array it
// never validates, it never sanitizes either). Without some replacement, a
// client could set `id`, `updatedAt`, etc. directly and have them written
// verbatim (drizzle's `.values()`/`.set()` writes whatever keys are
// present, keyed by schema property name, with no allowlist of its own).
// `plainToInstance(cls, item, { excludeExtraneousValues: true })` closes
// that gap independently of class-validator's whitelist: it keeps only
// the properties the DTO marks `@Expose()` (see create-vendor.dto.ts /
// batch-update-vendors.dto.ts), so the DTO stays the single source of
// truth for "what's writable" instead of a second, hand-picked field list
// living here. The sanitized instance (not the raw item) is what callers
// must write to the db.
async function sanitizeAndValidate<T extends object>(
  cls: ClassConstructor<T>,
  item: object,
): Promise<SanitizeResult<T>> {
  const value = plainToInstance(cls, item, { excludeExtraneousValues: true });
  const errors = await validate(value);
  if (errors.length === 0) return { value };

  const codes = errors.flatMap((error) =>
    Object.values(error.constraints ?? {}).flatMap((message) =>
      parseConstraintMessage(message).map((item) => item.code),
    ),
  );
  return { error: `Validation failed: ${codes.join(', ')}` };
}

@Injectable()
export class VendorsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findAll(
    query: FindVendorsDto,
  ): Promise<{ data: Vendor[]; total: number }> {
    const conditions = [];
    if (query.name)
      conditions.push(ilike(vendors.name, containsPattern(query.name)));
    if (query.websiteUrl)
      conditions.push(
        ilike(vendors.websiteUrl, containsPattern(query.websiteUrl)),
      );
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
      const sanitized = await sanitizeAndValidate(CreateVendorDto, item);
      if ('error' in sanitized) {
        results.push({ success: false, error: sanitized.error });
        continue;
      }

      try {
        const [vendor] = await this.db
          .insert(vendors)
          .values(sanitized.value)
          .returning();
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
      // Kept only for reporting which item failed a validation error —
      // the actual write always goes through the sanitized value below,
      // never this raw id (which could itself be the wrong type).
      const rawId = (item as { id?: unknown }).id;

      const sanitized = await sanitizeAndValidate(UpdateVendorItemDto, item);
      if ('error' in sanitized) {
        results.push({
          id: typeof rawId === 'number' ? rawId : undefined,
          success: false,
          error: sanitized.error,
        });
        continue;
      }

      const { id, ...rest } = sanitized.value;
      // plainToInstance leaves an @Expose()'d field present but `undefined`
      // when the client didn't send it (PartialType makes name/websiteUrl
      // optional) — drop those so `.set()` only ever receives fields that
      // were actually provided, same as the original `{ id, ...changes }`
      // destructure did.
      const changes = Object.fromEntries(
        Object.entries(rest).filter(([, value]) => value !== undefined),
      );

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
