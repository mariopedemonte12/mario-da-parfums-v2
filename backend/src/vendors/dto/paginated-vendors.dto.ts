import { ApiProperty } from '@nestjs/swagger';
import { ResponseVendorDto } from './response-vendor.dto.js';

export class PaginationMetaDto {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 3 })
  totalPages: number;
}

export class PaginatedVendorsDto {
  @ApiProperty({ type: [ResponseVendorDto] })
  data: ResponseVendorDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
