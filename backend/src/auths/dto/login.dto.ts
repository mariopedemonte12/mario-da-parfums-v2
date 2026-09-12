import { IsStringField } from '../../validators/wrappers/is-string.wrapper.js';
import { IsEmailField } from '../../validators/wrappers/is-email.wrapper.js';
import { IsRequired } from '../../validators/wrappers/is-not-empty.wrapper.js';
import { ValidationErrorCode } from '../../shared/enums/validation-error-code.enums.js';

export class LoginDto {
  @IsRequired(ValidationErrorCode.EMAIL_REQUIRED)
  @IsEmailField(ValidationErrorCode.EMAIL_INVALID_FORMAT)
  email: string;

  @IsRequired(ValidationErrorCode.PASSWORD_REQUIRED)
  @IsStringField(ValidationErrorCode.PASSWORD_INVALID_TYPE)
  password: string;
}
