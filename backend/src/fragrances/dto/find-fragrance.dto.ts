import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
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
import { IsNoNul } from '../../validators/is-no-nul.validator.js';
import { normalizeSearchText } from '../../validators/helpers/normalize-search-text.js';
import { IsStringField } from '../../validators/wrappers/is-string.wrapper.js';

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;
export const MAX_SEARCH_LENGTH = 100;
export const MAX_SEARCH_TOKENS = 5;

export class FindFragranceDto {
  @ApiPropertyOptional({
    description:
      'Free-text search: whitespace-separated tokens, each must appear (partial, case-insensitive) in the name or brand, in any order. Trimmed and de-duplicated before validation; max 5 distinct tokens / 100 chars; NUL rejected.',
    maxLength: MAX_SEARCH_LENGTH,
  })
  @IsOptional()
  @Transform(({ value }) => normalizeSearchText(value))
  @IsStringField(ValidationErrorCode.NAME_INVALID_TYPE)
  @IsNoNul()
  @MaxLength(MAX_SEARCH_LENGTH)
  @Matches(new RegExp(`^\\s*(\\S+\\s+){0,${MAX_SEARCH_TOKENS - 1}}\\S*\\s*$`))
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by exact concentration' })
  @IsOptional()
  @IsStringField(ValidationErrorCode.CONCENTRATION_INVALID_TYPE)
  @IsNoNul()
  concentration?: string;

  @ApiPropertyOptional({ description: 'Filter by exact olfactory family' })
  @IsOptional()
  @IsStringField(ValidationErrorCode.OLFACTORY_FAMILY_INVALID_TYPE)
  @IsNoNul()
  olfactoryFamily?: string;

  @ApiPropertyOptional({ description: 'Filter by exact target audience' })
  @IsOptional()
  @IsStringField(ValidationErrorCode.TARGET_AUDIENCE_INVALID_TYPE)
  @IsNoNul()
  targetAudience?: string;

  @ApiPropertyOptional({ description: 'Filter by exact longevity' })
  @IsOptional()
  @IsStringField(ValidationErrorCode.LONGEVITY_INVALID_TYPE)
  @IsNoNul()
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
