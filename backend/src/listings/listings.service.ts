import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, asc, eq, gt, gte, lte } from 'drizzle-orm';
import { DRIZZLE } from '../database/database.module.js';
import type { Database } from '../database/database.module.js';
import { listings } from '../database/schema/listing.schema.js';
import type { Listing } from './entities/listing.entity.js';
import { CreateListingDto } from './dto/create-listing.dto.js';
import { UpdateListingItemDto } from './dto/batch-update-listings.dto.js';
import { FindListingsDto } from './dto/find-listings.dto.js';
import { BatchItemResultDto } from './dto/batch-result.dto.js';
import { getPgErrorCode } from '../common/utils/pg-error.util.js';

function describeWriteError(err: unknown): string {
  const code = getPgErrorCode(err);
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
  ): Promise<{ data: Listing[]; nextCursor: number | null }> {
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
      query.cursor !== undefined ? gt(listings.id, query.cursor) : undefined,
    ].filter(
      (condition): condition is NonNullable<typeof condition> =>
        condition !== undefined,
    );
    const where = conditions.length ? and(...conditions) : undefined;

    const data = await this.db
      .select()
      .from(listings)
      .where(where)
      .orderBy(asc(listings.id))
      .limit(query.limit);

    const nextCursor =
      data.length === query.limit ? data[data.length - 1].id : null;

    return { data, nextCursor };
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
