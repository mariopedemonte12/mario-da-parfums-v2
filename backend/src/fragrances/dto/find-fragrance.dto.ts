import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ValidationErrorCode } from '../../shared/enums/validation-error-code.enums.js';
import { IsStringField } from '../../validators/wrappers/is-string.wrapper.js';

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;
export const MAX_SEARCH_LENGTH = 100;
export const MAX_SEARCH_TOKENS = 5;

export class FindFragranceDto {
  @ApiPropertyOptional({
    description:
      'Free-text search: whitespace-separated tokens, each must appear (partial, case-insensitive) in the name or brand, in any order. Max 5 tokens / 100 chars.',
    maxLength: MAX_SEARCH_LENGTH,
  })
  @IsOptional()
  @IsStringField(ValidationErrorCode.NAME_INVALID_TYPE)
  @MaxLength(MAX_SEARCH_LENGTH)
  @Matches(new RegExp(`^\\s*(\\S+\\s+){0,${MAX_SEARCH_TOKENS - 1}}\\S*\\s*$`))
  search?: string;

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
