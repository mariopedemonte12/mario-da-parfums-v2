import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ValidationErrorCode } from '../../shared/enums/validation-error-code.enums.js';
import { IsStringField } from '../../validators/wrappers/is-string.wrapper.js';

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export class FindFragranceDto {
  @ApiPropertyOptional({
    description: 'Filter by name (partial, case-insensitive match)',
  })
  @IsOptional()
  @IsStringField(ValidationErrorCode.NAME_INVALID_TYPE)
  name?: string;

  @ApiPropertyOptional({ description: 'Filter by exact brand' })
  @IsOptional()
  @IsStringField(ValidationErrorCode.BRAND_INVALID_TYPE)
  brand?: string;

  @ApiPropertyOptional({ description: 'Filter by exact concentration' })
  @IsOptional()
  @IsStringField(ValidationErrorCode.CONCENTRATION_INVALID_TYPE)
  concentration?: string;

  @ApiPropertyOptional({ default: DEFAULT_PAGE, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = DEFAULT_PAGE;

  @ApiPropertyOptional({
    default: DEFAULT_LIMIT,
    minimum: 1,
    maximum: MAX_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit?: number = DEFAULT_LIMIT;
}
