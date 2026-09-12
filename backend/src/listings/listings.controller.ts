import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ListingsService } from './listings.service.js';
import { FindListingsDto } from './dto/find-listings.dto.js';
import { ResponseListingDto } from './dto/response-listing.dto.js';
import { PaginatedListingsDto } from './dto/paginated-listings.dto.js';
import { BatchCreateListingsDto } from './dto/batch-create-listings.dto.js';
import { BatchUpdateListingsDto } from './dto/batch-update-listings.dto.js';
import { BatchDeleteListingsDto } from './dto/batch-delete-listings.dto.js';
import { BatchResultDto } from './dto/batch-result.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../shared/enums/role.enums.js';

// Serves the listings data model: the current price of one fragrance, in one
// size, at one vendor. Public reads, admin-only batch writes. Does not own
// the scraping jobs that populate/refresh listings, nor any price-comparison
// endpoint layered on top of this plain CRUD.
@ApiTags('listings')
@Controller('listings')
export class ListingsController {
  constructor(private readonly listingsService: ListingsService) {}

  @Get()
  @ApiOperation({
    summary: 'List listings with optional filters and pagination',
  })
  @ApiResponse({ status: 200, type: PaginatedListingsDto })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  async findAll(
    @Query() query: FindListingsDto,
  ): Promise<PaginatedListingsDto> {
    const { data, total } = await this.listingsService.findAll(query);
    return {
      data: plainToInstance(ResponseListingDto, data, {
        excludeExtraneousValues: true,
      }),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a listing by id' })
  @ApiResponse({ status: 200, type: ResponseListingDto })
  @ApiResponse({ status: 404, description: 'Listing not found' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ResponseListingDto> {
    const listing = await this.listingsService.findOne(id);
    return plainToInstance(ResponseListingDto, listing, {
      excludeExtraneousValues: true,
    });
  }

  @Post('batch')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Create one or more listings (partial success per item)',
  })
  @ApiResponse({ status: 201, type: BatchResultDto })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid authentication',
  })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async createMany(
    @Body() dto: BatchCreateListingsDto,
  ): Promise<BatchResultDto> {
    const results = await this.listingsService.createMany(dto.items);
    return { results };
  }

  @Patch('batch')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Update one or more listings (partial success per item)',
  })
  @ApiResponse({ status: 200, type: BatchResultDto })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid authentication',
  })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async updateMany(
    @Body() dto: BatchUpdateListingsDto,
  ): Promise<BatchResultDto> {
    const results = await this.listingsService.updateMany(dto.items);
    return { results };
  }

  @Delete('batch')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Delete one or more listings (partial success per item)',
  })
  @ApiResponse({ status: 200, type: BatchResultDto })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid authentication',
  })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async removeMany(
    @Body() dto: BatchDeleteListingsDto,
  ): Promise<BatchResultDto> {
    const results = await this.listingsService.removeMany(dto.ids);
    return { results };
  }
}
