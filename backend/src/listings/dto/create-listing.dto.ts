import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { ValidationErrorCode } from '../../shared/enums/validation-error-code.enums.js';
import { buildErrorMessage } from '../../validators/helpers/build-error-message.js';
import { IsRequired } from '../../validators/wrappers/is-not-empty.wrapper.js';
import { MaxLen } from '../../validators/wrappers/is-length.wrapper.js';
import { IsUrlField } from '../../validators/wrappers/is-url.wrapper.js';

export class CreateListingDto {
  @ApiProperty({
    description: 'Id of the fragrance this listing is for',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  @IsRequired(ValidationErrorCode.LISTING_FRAGRANCE_ID_REQUIRED)
  @IsUUID('4', {
    message: buildErrorMessage({
      code: ValidationErrorCode.LISTING_FRAGRANCE_ID_INVALID_FORMAT,
    }),
  })
  fragranceId: string;

  @ApiProperty({
    description: 'Id of the vendor this listing is at',
    example: 1,
  })
  @IsRequired(ValidationErrorCode.LISTING_VENDOR_ID_REQUIRED)
  @IsInt({
    message: buildErrorMessage({
      code: ValidationErrorCode.LISTING_VENDOR_ID_INVALID_TYPE,
    }),
  })
  @Min(1, {
    message: buildErrorMessage({
      code: ValidationErrorCode.LISTING_VENDOR_ID_INVALID_TYPE,
    }),
  })
  vendorId: number;

  @ApiProperty({ description: 'Size in milliliters', example: 100 })
  @IsRequired(ValidationErrorCode.LISTING_SIZE_ML_REQUIRED)
  @IsInt({
    message: buildErrorMessage({
      code: ValidationErrorCode.LISTING_SIZE_ML_INVALID_TYPE,
    }),
  })
  @Min(1, {
    message: buildErrorMessage({
      code: ValidationErrorCode.LISTING_SIZE_ML_INVALID_TYPE,
    }),
  })
  sizeMl: number;

  @ApiProperty({
    description: 'Current price in CLP (integer)',
    example: 89990,
  })
  @IsRequired(ValidationErrorCode.LISTING_PRICE_REQUIRED)
  @IsInt({
    message: buildErrorMessage({
      code: ValidationErrorCode.LISTING_PRICE_INVALID_TYPE,
    }),
  })
  @Min(1, {
    message: buildErrorMessage({
      code: ValidationErrorCode.LISTING_PRICE_INVALID_TYPE,
    }),
  })
  price: number;

  @ApiProperty({
    description: 'URL of the product on the vendor site',
    maxLength: 500,
    example: 'https://www.example-store.com/products/bleu-de-chanel-100ml',
  })
  @IsRequired(ValidationErrorCode.LISTING_URL_REQUIRED)
  @IsUrlField(ValidationErrorCode.LISTING_URL_INVALID_FORMAT)
  @MaxLen(500, ValidationErrorCode.LISTING_URL_TOO_LONG)
  url: string;

  @ApiPropertyOptional({
    description: 'Whether the vendor currently has this listing in stock',
    default: true,
  })
  @IsOptional()
  @IsBoolean({
    message: buildErrorMessage({
      code: ValidationErrorCode.LISTING_IN_STOCK_INVALID_TYPE,
    }),
  })
  inStock?: boolean;
}
