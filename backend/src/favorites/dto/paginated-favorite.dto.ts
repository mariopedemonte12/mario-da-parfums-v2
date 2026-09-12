import { ApiProperty } from '@nestjs/swagger';
import { ResponseFavoriteDto } from './response-favorite.dto.js';

export class PaginatedFavoriteDto {
  @ApiProperty({ type: [ResponseFavoriteDto] })
  data: ResponseFavoriteDto[];

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;
}
