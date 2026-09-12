import { Exclude, Expose, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ResponseFragranceDto } from '../../fragrances/dto/response-fragrance.dto.js';

@Exclude()
export class ResponseFavoriteDto {
  @ApiProperty({ example: 1, description: 'Favorite record id' })
  @Expose()
  id: number;

  @ApiProperty({ type: ResponseFragranceDto })
  @Expose()
  @Type(() => ResponseFragranceDto)
  fragrance: ResponseFragranceDto;

  @ApiProperty()
  @Expose()
  createdAt: Date;
}
