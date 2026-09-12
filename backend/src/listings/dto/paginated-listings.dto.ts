import { ApiProperty } from '@nestjs/swagger';
import { ResponseListingDto } from './response-listing.dto.js';

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

export class PaginatedListingsDto {
  @ApiProperty({ type: [ResponseListingDto] })
  data: ResponseListingDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
