import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { ValidationErrorCode } from '../../shared/enums/validation-error-code.enums.js';
import { IsRequired } from '../../validators/wrappers/is-not-empty.wrapper.js';
import { IsStringField } from '../../validators/wrappers/is-string.wrapper.js';
import { IsImageUrl } from '../../validators/is-image-url.validator.js';

export class CreateFragranceDto {
  @ApiProperty({
    example: 'Bleu de Chanel',
    description: 'Fragrance name (unique)',
  })
  @IsRequired(ValidationErrorCode.NAME_REQUIRED)
  @IsStringField(ValidationErrorCode.NAME_INVALID_TYPE)
  name: string;

  @ApiProperty({ example: 'Chanel', description: 'Brand/house name' })
  @IsRequired(ValidationErrorCode.BRAND_REQUIRED)
  @IsStringField(ValidationErrorCode.BRAND_INVALID_TYPE)
  brand: string;

  @ApiPropertyOptional({
    example: 'Eau de Parfum',
    description: 'Concentration/formulation',
  })
  @IsOptional()
  @IsStringField(ValidationErrorCode.CONCENTRATION_INVALID_TYPE)
  concentration?: string;

  @ApiPropertyOptional({ example: 'A woody aromatic fragrance...' })
  @IsOptional()
  @IsStringField(ValidationErrorCode.DESCRIPTION_INVALID_TYPE)
  description?: string;

  @ApiPropertyOptional({
    example: 'https://example.com/images/bleu-de-chanel.jpg',
    description:
      'URL of the fragrance photo, obtained via webscraping. Must be an http(s) URL with an image extension (.jpg, .jpeg, .png, .webp, .gif, .avif).',
  })
  @IsOptional()
  @IsImageUrl()
  imageUrl?: string;
}
