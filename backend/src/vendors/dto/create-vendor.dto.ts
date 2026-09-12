import { Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ValidationErrorCode } from '../../shared/enums/validation-error-code.enums.js';
import { IsRequired } from '../../validators/wrappers/is-not-empty.wrapper.js';
import { IsStringField } from '../../validators/wrappers/is-string.wrapper.js';
import { MaxLen } from '../../validators/wrappers/is-length.wrapper.js';
import { IsUrlField } from '../../validators/wrappers/is-url.wrapper.js';

// @Expose() here is the allowlist VendorsService relies on
// (plainToInstance(..., { excludeExtraneousValues: true })) to strip any
// extra properties (id, createdAt, updatedAt, ...) a client might send in
// a batch item before it ever reaches the db — see the comment on
// sanitizeAndValidate() in vendors.service.ts for why this can't just be
// @ValidateNested + the global pipe's whitelist instead.
export class CreateVendorDto {
  @ApiProperty({
    description: 'Vendor display name, must be unique',
    maxLength: 128,
    example: 'Fragrantica Store',
  })
  @Expose()
  @IsRequired(ValidationErrorCode.VENDOR_NAME_REQUIRED)
  @IsStringField(ValidationErrorCode.VENDOR_NAME_INVALID_TYPE)
  @MaxLen(128, ValidationErrorCode.VENDOR_NAME_TOO_LONG)
  name: string;

  @ApiProperty({
    description: 'Vendor website URL',
    maxLength: 255,
    example: 'https://www.example-store.com',
  })
  @Expose()
  @IsRequired(ValidationErrorCode.VENDOR_WEBSITE_URL_REQUIRED)
  @IsUrlField(ValidationErrorCode.VENDOR_WEBSITE_URL_INVALID_FORMAT)
  @MaxLen(255, ValidationErrorCode.VENDOR_WEBSITE_URL_TOO_LONG)
  websiteUrl: string;
}
