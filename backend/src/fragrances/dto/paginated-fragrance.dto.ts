import { ApiProperty } from '@nestjs/swagger';
import { ResponseFragranceDto } from './response-fragrance.dto.js';

export class PaginatedFragranceDto {
  @ApiProperty({ type: [ResponseFragranceDto] })
  data: ResponseFragranceDto[];

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;
}
