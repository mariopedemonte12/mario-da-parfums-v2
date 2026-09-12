import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FavoritesService } from './favorites.service.js';
import { FindFavoritesDto } from './dto/find-favorites.dto.js';
import { PaginatedFavoriteDto } from './dto/paginated-favorite.dto.js';
import { FavoriteCountDto } from './dto/favorite-count.dto.js';
import { CreateFavoriteBatchDto } from './dto/create-favorite-batch.dto.js';
import { DeleteFavoriteBatchDto } from './dto/delete-favorite-batch.dto.js';
import { CreateBatchResultDto } from './dto/create-batch-result.dto.js';
import { BatchResultDto } from './dto/batch-result.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auths/interfaces/jwt-payload.interface.js';

// Owns: the User<->Fragrance favorite relation (mark/unmark, list a user's
// own favorites, per-fragrance favorite counts). Does not own: fragrance
// catalog data or price/listing info — combining favorites with price data
// is explicitly out of scope for this feature (see specs/favorite-module.md).
@ApiTags('favorites')
@ApiBearerAuth()
@Controller('favorites')
@UseGuards(JwtAuthGuard)
export class FavoritesController {
  constructor(private readonly favoritesService: FavoritesService) {}

  @Get()
  @ApiOperation({ summary: "List the caller's favorite fragrances" })
  @ApiResponse({ status: 200, type: PaginatedFavoriteDto })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() query: FindFavoritesDto,
  ): Promise<PaginatedFavoriteDto> {
    return this.favoritesService.findAllForUser(user.sub, query);
  }

  @Get('fragrances/:fragranceId/count')
  @ApiOperation({
    summary: 'Get how many users have a fragrance marked as favorite',
  })
  @ApiResponse({ status: 200, type: FavoriteCountDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({ status: 404, description: 'Fragrance not found' })
  getFavoritesCount(
    @Param('fragranceId', ParseUUIDPipe) fragranceId: string,
  ): Promise<FavoriteCountDto> {
    return this.favoritesService.getFavoritesCount(fragranceId);
  }

  @Post('batch')
  @ApiOperation({
    summary: 'Mark one or more fragrances as favorite (partial success)',
  })
  @ApiResponse({ status: 201, type: [CreateBatchResultDto] })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  createBatch(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateFavoriteBatchDto,
  ): Promise<CreateBatchResultDto[]> {
    return this.favoritesService.createMany(user.sub, dto.fragranceIds);
  }

  @Delete('batch')
  @ApiOperation({
    summary: 'Unmark one or more fragrances as favorite (partial success)',
  })
  @ApiResponse({ status: 200, type: [BatchResultDto] })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  removeBatch(
    @CurrentUser() user: JwtPayload,
    @Body() dto: DeleteFavoriteBatchDto,
  ): Promise<BatchResultDto[]> {
    return this.favoritesService.removeMany(user.sub, dto.fragranceIds);
  }
}
