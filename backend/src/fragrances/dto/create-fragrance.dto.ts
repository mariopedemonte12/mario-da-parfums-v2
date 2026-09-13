import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { ValidationErrorCode } from '../../shared/enums/validation-error-code.enums.js';
import { IsRequired } from '../../validators/wrappers/is-not-empty.wrapper.js';
import { IsStringField } from '../../validators/wrappers/is-string.wrapper.js';
import { MaxLen } from '../../validators/wrappers/is-length.wrapper.js';
import { IsImageUrl } from '../../validators/is-image-url.validator.js';

// Length limits mirror the DB columns (fragrance.schema.ts) so an
// oversized value fails DTO validation (400, per-field FieldError) instead
// of reaching Postgres and failing as an opaque per-item write error.
const NAME_MAX_LENGTH = 255;
const BRAND_MAX_LENGTH = 128;
const CONCENTRATION_MAX_LENGTH = 128;
const IMAGE_URL_MAX_LENGTH = 500;
const OLFACTORY_FAMILY_MAX_LENGTH = 128;
const TARGET_AUDIENCE_MAX_LENGTH = 32;
const LONGEVITY_MAX_LENGTH = 32;

export class CreateFragranceDto {
  @ApiProperty({
    example: 'Bleu de Chanel',
    description: 'Fragrance name (unique)',
    maxLength: NAME_MAX_LENGTH,
  })
  @IsRequired(ValidationErrorCode.NAME_REQUIRED)
  @IsStringField(ValidationErrorCode.NAME_INVALID_TYPE)
  @MaxLen(NAME_MAX_LENGTH, ValidationErrorCode.NAME_TOO_LONG)
  name: string;

  @ApiProperty({
    example: 'Chanel',
    description: 'Brand/house name',
    maxLength: BRAND_MAX_LENGTH,
  })
  @IsRequired(ValidationErrorCode.BRAND_REQUIRED)
  @IsStringField(ValidationErrorCode.BRAND_INVALID_TYPE)
  @MaxLen(BRAND_MAX_LENGTH, ValidationErrorCode.BRAND_TOO_LONG)
  brand: string;

  @ApiPropertyOptional({
    example: 'Eau de Parfum',
    description: 'Concentration/formulation',
    maxLength: CONCENTRATION_MAX_LENGTH,
  })
  @IsOptional()
  @IsStringField(ValidationErrorCode.CONCENTRATION_INVALID_TYPE)
  @MaxLen(CONCENTRATION_MAX_LENGTH, ValidationErrorCode.CONCENTRATION_TOO_LONG)
  concentration?: string;

  @ApiPropertyOptional({ example: 'A woody aromatic fragrance...' })
  @IsOptional()
  @IsStringField(ValidationErrorCode.DESCRIPTION_INVALID_TYPE)
  description?: string;

  @ApiPropertyOptional({
    example: 'https://example.com/images/bleu-de-chanel.jpg',
    description:
      'URL of the fragrance photo, obtained via webscraping. Must be an http(s) URL with an image extension (.jpg, .jpeg, .png, .webp, .gif, .avif).',
    maxLength: IMAGE_URL_MAX_LENGTH,
  })
  @IsOptional()
  @IsImageUrl()
  @MaxLen(IMAGE_URL_MAX_LENGTH, ValidationErrorCode.IMAGE_URL_TOO_LONG)
  imageUrl?: string;

  @ApiPropertyOptional({
    example: 'Woody Spicy',
    description: 'Olfactory family/category',
    maxLength: OLFACTORY_FAMILY_MAX_LENGTH,
  })
  @IsOptional()
  @IsStringField(ValidationErrorCode.OLFACTORY_FAMILY_INVALID_TYPE)
  @MaxLen(
    OLFACTORY_FAMILY_MAX_LENGTH,
    ValidationErrorCode.OLFACTORY_FAMILY_TOO_LONG,
  )
  olfactoryFamily?: string;

  @ApiPropertyOptional({
    example: 'Male',
    description: 'Target audience (e.g. Male, Female, Unisex)',
    maxLength: TARGET_AUDIENCE_MAX_LENGTH,
  })
  @IsOptional()
  @IsStringField(ValidationErrorCode.TARGET_AUDIENCE_INVALID_TYPE)
  @MaxLen(
    TARGET_AUDIENCE_MAX_LENGTH,
    ValidationErrorCode.TARGET_AUDIENCE_TOO_LONG,
  )
  targetAudience?: string;

  @ApiPropertyOptional({
    example: 'Medium-Strong',
    description: 'Longevity/intensity (e.g. Light, Medium, Very Strong)',
    maxLength: LONGEVITY_MAX_LENGTH,
  })
  @IsOptional()
  @IsStringField(ValidationErrorCode.LONGEVITY_INVALID_TYPE)
  @MaxLen(LONGEVITY_MAX_LENGTH, ValidationErrorCode.LONGEVITY_TOO_LONG)
  longevity?: string;
}
