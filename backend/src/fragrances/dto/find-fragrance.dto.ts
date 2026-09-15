import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { ValidationErrorCode } from '../../shared/enums/validation-error-code.enums.js';
import { IsStringField } from '../../validators/wrappers/is-string.wrapper.js';

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

  @ApiPropertyOptional({ description: 'Filter by exact olfactory family' })
  @IsOptional()
  @IsStringField(ValidationErrorCode.OLFACTORY_FAMILY_INVALID_TYPE)
  olfactoryFamily?: string;

  @ApiPropertyOptional({ description: 'Filter by exact target audience' })
  @IsOptional()
  @IsStringField(ValidationErrorCode.TARGET_AUDIENCE_INVALID_TYPE)
  targetAudience?: string;

  @ApiPropertyOptional({ description: 'Filter by exact longevity' })
  @IsOptional()
  @IsStringField(ValidationErrorCode.LONGEVITY_INVALID_TYPE)
  longevity?: string;

  @ApiPropertyOptional({
    description:
      'Keyset cursor: the id of the last item from the previous page. Omit to start from the first page.',
  })
  @IsOptional()
  @IsUUID('4')
  cursor?: string;

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
