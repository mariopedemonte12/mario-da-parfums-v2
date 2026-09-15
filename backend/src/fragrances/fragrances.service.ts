import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, asc, eq, gt, ilike } from 'drizzle-orm';
import { plainToInstance } from 'class-transformer';
import { DRIZZLE } from '../database/database.module.js';
import type { Database } from '../database/database.module.js';
import {
  fragrances,
  type Fragrance,
} from '../database/schema/fragrance.schema.js';
import { CreateFragranceDto } from './dto/create-fragrance.dto.js';
import { UpdateFragranceDto } from './dto/update-fragrance.dto.js';
import { UpdateFragranceBatchItemDto } from './dto/update-fragrance-batch.dto.js';
import { FindFragranceDto } from './dto/find-fragrance.dto.js';
import { ResponseFragranceDto } from './dto/response-fragrance.dto.js';
import { PaginatedFragranceDto } from './dto/paginated-fragrance.dto.js';
import { BatchResultDto } from './dto/batch-result.dto.js';
import { CreateBatchResultDto } from './dto/create-batch-result.dto.js';
import { getPgErrorCode } from '../common/utils/pg-error.util.js';

const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  return getPgErrorCode(error) === UNIQUE_VIOLATION;
}

@Injectable()
export class FragrancesService {
  private readonly logger = new Logger(FragrancesService.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async findAll(query: FindFragranceDto): Promise<PaginatedFragranceDto> {
    const {
      name,
      brand,
      concentration,
      olfactoryFamily,
      targetAudience,
      longevity,
      cursor,
      limit = 20,
    } = query;

    const conditions = [
      name ? ilike(fragrances.name, `%${name}%`) : undefined,
      brand ? eq(fragrances.brand, brand) : undefined,
      concentration ? eq(fragrances.concentration, concentration) : undefined,
      olfactoryFamily
        ? eq(fragrances.olfactoryFamily, olfactoryFamily)
        : undefined,
      targetAudience
        ? eq(fragrances.targetAudience, targetAudience)
        : undefined,
      longevity ? eq(fragrances.longevity, longevity) : undefined,
      cursor ? gt(fragrances.id, cursor) : undefined,
    ].filter(
      (condition): condition is NonNullable<typeof condition> =>
        condition !== undefined,
    );

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await this.db
      .select()
      .from(fragrances)
      .where(where)
      .orderBy(asc(fragrances.id))
      .limit(limit)
      .execute();

    return {
      data: rows.map((row) => this.toResponseDto(row)),
      nextCursor: rows.length === limit ? rows[rows.length - 1].id : null,
    };
  }

  async findOne(id: string): Promise<ResponseFragranceDto> {
    const fragrance = await this.findFragranceOrThrow(id);
    return this.toResponseDto(fragrance);
  }

  async createMany(
    items: CreateFragranceDto[],
  ): Promise<CreateBatchResultDto[]> {
    return Promise.all(items.map((item) => this.createOne(item)));
  }

  async updateMany(
    items: UpdateFragranceBatchItemDto[],
  ): Promise<BatchResultDto[]> {
    return Promise.all(
      items.map(({ id, ...data }) => this.updateOne(id, data)),
    );
  }

  async removeMany(ids: string[]): Promise<BatchResultDto[]> {
    return Promise.all(ids.map((id) => this.removeOne(id)));
  }

  private async createOne(
    data: CreateFragranceDto,
  ): Promise<CreateBatchResultDto> {
    try {
      const [fragrance] = await this.db
        .insert(fragrances)
        .values(data)
        .returning();
      return { success: true, id: fragrance.id };
    } catch (error) {
      return {
        success: false,
        error: this.describeWriteError(error, data.name),
      };
    }
  }

  private async updateOne(
    id: string,
    data: UpdateFragranceDto,
  ): Promise<BatchResultDto> {
    try {
      const [fragrance] = await this.db
        .update(fragrances)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(fragrances.id, id))
        .returning();

      if (!fragrance) {
        return { id, success: false, error: 'Fragrance not found' };
      }

      return { id, success: true };
    } catch (error) {
      return {
        id,
        success: false,
        error: this.describeWriteError(error, data.name),
      };
    }
  }

  private async removeOne(id: string): Promise<BatchResultDto> {
    try {
      const [fragrance] = await this.db
        .delete(fragrances)
        .where(eq(fragrances.id, id))
        .returning();

      if (!fragrance) {
        return { id, success: false, error: 'Fragrance not found' };
      }

      return { id, success: true };
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error));
      return { id, success: false, error: 'Failed to delete fragrance' };
    }
  }

  private async findFragranceOrThrow(id: string): Promise<Fragrance> {
    const [fragrance] = await this.db
      .select()
      .from(fragrances)
      .where(eq(fragrances.id, id))
      .execute();

    if (!fragrance) {
      throw new NotFoundException(`Fragrance ${id} not found`);
    }

    return fragrance;
  }

  private toResponseDto(fragrance: Fragrance): ResponseFragranceDto {
    return plainToInstance(ResponseFragranceDto, fragrance, {
      excludeExtraneousValues: true,
    });
  }

  private describeWriteError(error: unknown, name?: string): string {
    if (isUniqueViolation(error)) {
      return name
        ? `Fragrance "${name}" already exists`
        : 'Fragrance already exists';
    }

    this.logger.error(error instanceof Error ? error.message : String(error));
    return 'Failed to save fragrance';
  }
}
