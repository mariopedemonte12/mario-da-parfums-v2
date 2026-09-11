import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Delete,
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
import { VendorsService } from './vendors.service.js';
import { FindVendorsDto } from './dto/find-vendors.dto.js';
import { ResponseVendorDto } from './dto/response-vendor.dto.js';
import { PaginatedVendorsDto } from './dto/paginated-vendors.dto.js';
import { BatchCreateVendorsDto } from './dto/batch-create-vendors.dto.js';
import { BatchUpdateVendorsDto } from './dto/batch-update-vendors.dto.js';
import { BatchDeleteVendorsDto } from './dto/batch-delete-vendors.dto.js';
import { BatchResultDto } from './dto/batch-result.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../shared/enums/role.enums.js';

// Serves the vendors data model: public reads, admin-only batch writes.
// Owns vendor records only — listings own the vendor/listing relationship.
@ApiTags('vendors')
@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Get()
  @ApiOperation({
    summary: 'List vendors with optional filters and pagination',
  })
  @ApiResponse({ status: 200, type: PaginatedVendorsDto })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  async findAll(@Query() query: FindVendorsDto): Promise<PaginatedVendorsDto> {
    const { data, total } = await this.vendorsService.findAll(query);
    return {
      data: plainToInstance(ResponseVendorDto, data, {
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
  @ApiOperation({ summary: 'Get a vendor by id' })
  @ApiResponse({ status: 200, type: ResponseVendorDto })
  @ApiResponse({ status: 404, description: 'Vendor not found' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ResponseVendorDto> {
    const vendor = await this.vendorsService.findOne(id);
    return plainToInstance(ResponseVendorDto, vendor, {
      excludeExtraneousValues: true,
    });
  }

  @Post('batch')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Create one or more vendors (partial success per item)',
  })
  @ApiResponse({ status: 201, type: BatchResultDto })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid authentication',
  })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async createMany(
    @Body() dto: BatchCreateVendorsDto,
  ): Promise<BatchResultDto> {
    const results = await this.vendorsService.createMany(dto.items);
    return { results };
  }

  @Patch('batch')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Update one or more vendors (partial success per item)',
  })
  @ApiResponse({ status: 200, type: BatchResultDto })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid authentication',
  })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async updateMany(
    @Body() dto: BatchUpdateVendorsDto,
  ): Promise<BatchResultDto> {
    const results = await this.vendorsService.updateMany(dto.items);
    return { results };
  }

  @Delete('batch')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Delete one or more vendors (partial success per item)',
  })
  @ApiResponse({ status: 200, type: BatchResultDto })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid authentication',
  })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async removeMany(
    @Body() dto: BatchDeleteVendorsDto,
  ): Promise<BatchResultDto> {
    const results = await this.vendorsService.removeMany(dto.ids);
    return { results };
  }
}
