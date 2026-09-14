import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, count, eq } from 'drizzle-orm';
import { plainToInstance } from 'class-transformer';
import { DRIZZLE } from '../database/database.module.js';
import type { Database } from '../database/database.module.js';
import { favorites } from '../database/schema/favorite.schema.js';
import { fragrances } from '../database/schema/fragrance.schema.js';
import { FragrancesService } from '../fragrances/fragrances.service.js';
import { ResponseFragranceDto } from '../fragrances/dto/response-fragrance.dto.js';
import { FindFavoritesDto } from './dto/find-favorites.dto.js';
import { PaginatedFavoriteDto } from './dto/paginated-favorite.dto.js';
import { ResponseFavoriteDto } from './dto/response-favorite.dto.js';
import { FavoriteCountDto } from './dto/favorite-count.dto.js';
import { CreateBatchResultDto } from './dto/create-batch-result.dto.js';
import { BatchResultDto } from './dto/batch-result.dto.js';
import { getPgErrorCode } from '../common/utils/pg-error.util.js';

const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  return getPgErrorCode(error) === UNIQUE_VIOLATION;
}

@Injectable()
export class FavoritesService {
  private readonly logger = new Logger(FavoritesService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly fragrancesService: FragrancesService,
  ) {}

  async findAllForUser(
    userId: number,
    query: FindFavoritesDto,
  ): Promise<PaginatedFavoriteDto> {
    const { page = 1, limit = 20 } = query;
    const where = eq(favorites.userId, userId);

    const [rows, totalRows] = await Promise.all([
      this.db
        .select({
          id: favorites.id,
          createdAt: favorites.createdAt,
          fragrance: fragrances,
        })
        .from(favorites)
        .innerJoin(fragrances, eq(favorites.fragranceId, fragrances.id))
        .where(where)
        .limit(limit)
        .offset((page - 1) * limit)
        .execute(),
      this.db.select({ value: count() }).from(favorites).where(where).execute(),
    ]);

    return {
      data: rows.map((row) =>
        plainToInstance(
          ResponseFavoriteDto,
          {
            id: row.id,
            createdAt: row.createdAt,
            fragrance: plainToInstance(ResponseFragranceDto, row.fragrance, {
              excludeExtraneousValues: true,
            }),
          },
          { excludeExtraneousValues: true },
        ),
      ),
      total: totalRows[0]?.value ?? 0,
      page,
      limit,
    };
  }

  async getFavoritesCount(fragranceId: string): Promise<FavoriteCountDto> {
    await this.fragrancesService.findOne(fragranceId);

    const [row] = await this.db
      .select({ value: count() })
      .from(favorites)
      .where(eq(favorites.fragranceId, fragranceId))
      .execute();

    return { fragranceId, favoritesCount: row?.value ?? 0 };
  }

  async createMany(
    userId: number,
    fragranceIds: string[],
  ): Promise<CreateBatchResultDto[]> {
    return Promise.all(
      fragranceIds.map((fragranceId) => this.createOne(userId, fragranceId)),
    );
  }

  async removeMany(
    userId: number,
    fragranceIds: string[],
  ): Promise<BatchResultDto[]> {
    return Promise.all(
      fragranceIds.map((fragranceId) => this.removeOne(userId, fragranceId)),
    );
  }

  private async createOne(
    userId: number,
    fragranceId: string,
  ): Promise<CreateBatchResultDto> {
    try {
      await this.fragrancesService.findOne(fragranceId);
    } catch {
      return { fragranceId, success: false, error: 'Fragrance not found' };
    }

    try {
      const [favorite] = await this.db
        .insert(favorites)
        .values({ userId, fragranceId })
        .returning();
      return { fragranceId, success: true, id: favorite.id };
    } catch (error) {
      if (isUniqueViolation(error)) {
        return {
          fragranceId,
          success: false,
          error: 'Fragrance already marked as favorite',
        };
      }
      this.logger.error(error instanceof Error ? error.message : String(error));
      return { fragranceId, success: false, error: 'Failed to save favorite' };
    }
  }

  private async removeOne(
    userId: number,
    fragranceId: string,
  ): Promise<BatchResultDto> {
    try {
      const [favorite] = await this.db
        .delete(favorites)
        .where(
          and(
            eq(favorites.userId, userId),
            eq(favorites.fragranceId, fragranceId),
          ),
        )
        .returning();

      if (!favorite) {
        return { fragranceId, success: false, error: 'Favorite not found' };
      }

      return { fragranceId, success: true };
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error));
      return {
        fragranceId,
        success: false,
        error: 'Failed to remove favorite',
      };
    }
  }
}
