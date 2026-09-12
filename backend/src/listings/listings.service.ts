import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, count, eq, gte, lte } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.module.js';
import type { Database } from '../database/database.module.js';
import { listings } from '../database/schema/listing.schema.js';
import type { Listing } from './entities/listing.entity.js';
import { CreateListingDto } from './dto/create-listing.dto.js';
import { UpdateListingItemDto } from './dto/batch-update-listings.dto.js';
import { FindListingsDto } from './dto/find-listings.dto.js';
import { BatchItemResultDto } from './dto/batch-result.dto.js';

interface PgError {
  code?: string;
}

function hasPgCode(value: unknown): value is PgError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof (value as PgError).code === 'string'
  );
}

// drizzle-orm 0.45.x wraps every real driver error in a DrizzleQueryError
// whose `.code` lives on `err.cause.code`, not `err.code` — so the Postgres
// error code must be looked up on both the error itself and its `cause`.
function pgErrorCode(err: unknown): string | undefined {
  if (hasPgCode(err)) return err.code;
  if (typeof err === 'object' && err !== null && 'cause' in err) {
    const cause = (err as { cause?: unknown }).cause;
    if (hasPgCode(cause)) return cause.code;
  }
  return undefined;
}

function describeWriteError(err: unknown): string {
  const code = pgErrorCode(err);
  if (code === '23505')
    return 'A listing for this vendor/fragrance/size already exists';
  if (code === '23503') return 'Fragrance or vendor not found';
  return 'Unexpected error';
}

@Injectable()
export class ListingsService {
  private readonly logger = new Logger(ListingsService.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findAll(
    query: FindListingsDto,
  ): Promise<{ data: Listing[]; total: number }> {
    const conditions = [
      query.fragranceId
        ? eq(listings.fragranceId, query.fragranceId)
        : undefined,
      query.vendorId !== undefined
        ? eq(listings.vendorId, query.vendorId)
        : undefined,
      query.inStock !== undefined
        ? eq(listings.inStock, query.inStock)
        : undefined,
      query.minPrice !== undefined
        ? gte(listings.price, query.minPrice)
        : undefined,
      query.maxPrice !== undefined
        ? lte(listings.price, query.maxPrice)
        : undefined,
    ].filter(
      (condition): condition is NonNullable<typeof condition> =>
        condition !== undefined,
    );
    const where = conditions.length ? and(...conditions) : undefined;

    const offset = (query.page - 1) * query.limit;

    const [data, totalRows] = await Promise.all([
      this.db
        .select()
        .from(listings)
        .where(where)
        .limit(query.limit)
        .offset(offset),
      this.db.select({ value: count() }).from(listings).where(where),
    ]);

    return { data, total: totalRows[0]?.value ?? 0 };
  }

  async findOne(id: number): Promise<Listing> {
    const [listing] = await this.db
      .select()
      .from(listings)
      .where(eq(listings.id, id));
    if (!listing) {
      throw new NotFoundException(`Listing ${id} not found`);
    }
    return listing;
  }

  async createMany(items: CreateListingDto[]): Promise<BatchItemResultDto[]> {
    const results: BatchItemResultDto[] = [];

    for (const item of items) {
      try {
        const [listing] = await this.db
          .insert(listings)
          .values(item)
          .returning();
        results.push({ id: listing.id, success: true });
      } catch (err) {
        results.push({ success: false, error: describeWriteError(err) });
      }
    }

    return results;
  }

  async updateMany(
    items: UpdateListingItemDto[],
  ): Promise<BatchItemResultDto[]> {
    const results: BatchItemResultDto[] = [];

    for (const { id, ...changes } of items) {
      try {
        const [listing] = await this.db
          .update(listings)
          .set({ ...changes, scrapedAt: new Date() })
          .where(eq(listings.id, id))
          .returning();
        if (!listing) {
          results.push({ id, success: false, error: 'Listing not found' });
          continue;
        }
        results.push({ id: listing.id, success: true });
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
        const [listing] = await this.db
          .delete(listings)
          .where(eq(listings.id, id))
          .returning();
        if (!listing) {
          results.push({ id, success: false, error: 'Listing not found' });
          continue;
        }
        results.push({ id, success: true });
      } catch (err) {
        this.logger.error(err instanceof Error ? err.message : String(err));
        results.push({ id, success: false, error: describeWriteError(err) });
      }
    }

    return results;
  }
}
