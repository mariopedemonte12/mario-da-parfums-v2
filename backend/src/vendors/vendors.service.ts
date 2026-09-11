import { Inject, Injectable, NotFoundException } from '@nestjs/common';
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

function describeWriteError(err: unknown): string {
  if (isPgError(err)) {
    if (err.code === '23505') return 'A vendor with that name already exists';
    if (err.code === '23503')
      return 'Vendor is referenced by existing listings';
  }
  return 'Unexpected error';
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

    for (const { id, ...changes } of items) {
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
