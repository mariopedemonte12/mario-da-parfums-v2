import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FragrancesService } from './fragrances.service.js';
import { CreateFragranceBatchDto } from './dto/create-fragrance-batch.dto.js';
import { UpdateFragranceBatchDto } from './dto/update-fragrance-batch.dto.js';
import { DeleteFragranceBatchDto } from './dto/delete-fragrance-batch.dto.js';
import { FindFragranceDto } from './dto/find-fragrance.dto.js';
import { ResponseFragranceDto } from './dto/response-fragrance.dto.js';
import { PaginatedFragranceDto } from './dto/paginated-fragrance.dto.js';
import { BatchResultDto } from './dto/batch-result.dto.js';
import { CreateBatchResultDto } from './dto/create-batch-result.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../shared/enums/role.enums.js';

// Owns: CRUD for the fragrance catalog (name/brand/concentration/description/imageUrl/olfactoryFamily/targetAudience/longevity).
// Does not own: obtaining imageUrl (external webscraper) or verifying it serves a real image (separate job).
// Access: reads (GET) are public; batch mutations (POST/PATCH/DELETE) are admin-only, guarded per-method.
@ApiTags('fragrances')
@Controller('fragrances')
export class FragrancesController {
  constructor(private readonly fragrancesService: FragrancesService) {}

  @Get()
  @ApiOperation({
    summary: 'List fragrances with server-side filtering and pagination',
  })
  @ApiResponse({ status: 200, type: PaginatedFragranceDto })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  findAll(@Query() query: FindFragranceDto): Promise<PaginatedFragranceDto> {
    return this.fragrancesService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a fragrance by id' })
  @ApiResponse({ status: 200, type: ResponseFragranceDto })
  @ApiResponse({ status: 404, description: 'Fragrance not found' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ResponseFragranceDto> {
    return this.fragrancesService.findOne(id);
  }

  @Post('batch')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create fragrances in batch (partial success)' })
  @ApiResponse({ status: 201, type: [CreateBatchResultDto] })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({ status: 403, description: 'Caller is not an admin' })
  createBatch(
    @Body() dto: CreateFragranceBatchDto,
  ): Promise<CreateBatchResultDto[]> {
    return this.fragrancesService.createMany(dto.items);
  }

  @Patch('batch')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update fragrances in batch (partial success)' })
  @ApiResponse({ status: 200, type: [BatchResultDto] })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({ status: 403, description: 'Caller is not an admin' })
  updateBatch(@Body() dto: UpdateFragranceBatchDto): Promise<BatchResultDto[]> {
    return this.fragrancesService.updateMany(dto.items);
  }

  @Delete('batch')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete fragrances in batch (partial success)' })
  @ApiResponse({ status: 200, type: [BatchResultDto] })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Missing or invalid token' })
  @ApiResponse({ status: 403, description: 'Caller is not an admin' })
  removeBatch(@Body() dto: DeleteFragranceBatchDto): Promise<BatchResultDto[]> {
    return this.fragrancesService.removeMany(dto.ids);
  }
}
