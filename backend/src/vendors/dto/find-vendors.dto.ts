import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsStringField } from '../../validators/wrappers/is-string.wrapper.js';

export class FindVendorsDto {
  @ApiPropertyOptional({
    description: 'Case-insensitive partial match on vendor name',
  })
  @IsOptional()
  @IsStringField()
  name?: string;

  @ApiPropertyOptional({
    description: 'Case-insensitive partial match on vendor website URL',
  })
  @IsOptional()
  @IsStringField()
  websiteUrl?: string;

  @ApiPropertyOptional({
    description: 'Page number, 1-indexed',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
