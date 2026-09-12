import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';
import { ValidationErrorCode } from '../../shared/enums/validation-error-code.enums.js';
import { IsNotProfane } from '../../validators/is-not-profane.validator.js';
import { IsStringField } from '../../validators/wrappers/is-string.wrapper.js';
import { IsEmailField } from '../../validators/wrappers/is-email.wrapper.js';
import { MaxLen } from '../../validators/wrappers/is-length.wrapper.js';
import { buildErrorMessage } from '../../validators/helpers/build-error-message.js';

// Valid S3 object key charset (safe/unreserved characters per S3 docs).
const S3_KEY_PATTERN = /^[a-zA-Z0-9!_.*'()/-]+$/;

// Profile fields only. Deliberately has no `role` or `password` — a role
// change is a separate, sensitive operation out of scope for this contract,
// and a password change needs its own flow that verifies the current
// password. Account creation (including admin-created accounts) belongs to
// `auths`, not `users` — see specs/users-crud.md.
export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Jane Doe' })
  @IsOptional()
  @IsStringField(ValidationErrorCode.NAME_INVALID_TYPE)
  @IsNotProfane()
  name?: string;

  @ApiPropertyOptional({ example: 'jane@example.com' })
  @IsOptional()
  @IsEmailField(ValidationErrorCode.EMAIL_INVALID_FORMAT)
  @IsNotProfane()
  email?: string;

  @ApiPropertyOptional({
    description: 'S3 object key for the user photo',
    example: 'users/avatars/1.jpg',
    maxLength: 255,
  })
  @IsOptional()
  @IsStringField(ValidationErrorCode.PHOTO_S3_KEY_INVALID_TYPE)
  @MaxLen(255, ValidationErrorCode.PHOTO_S3_KEY_TOO_LONG)
  @Matches(S3_KEY_PATTERN, {
    message: () =>
      buildErrorMessage({
        code: ValidationErrorCode.PHOTO_S3_KEY_INVALID_FORMAT,
      }),
  })
  photoS3Key?: string;
}
