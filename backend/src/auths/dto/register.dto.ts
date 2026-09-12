import { IsStringField } from '../../validators/wrappers/is-string.wrapper.js';
import { IsStrongPassword } from '../../validators/is-password-strong.validator.js';
import { IsEmailField } from '../../validators/wrappers/is-email.wrapper.js';
import { IsNotProfane } from '../../validators/is-not-profane.validator.js';
import { IsRequired } from '../../validators/wrappers/is-not-empty.wrapper.js';
import { ValidationErrorCode } from '../../shared/enums/validation-error-code.enums.js';

export class RegisterDto {
  @IsRequired(ValidationErrorCode.NAME_REQUIRED)
  @IsStringField(ValidationErrorCode.NAME_INVALID_TYPE)
  @IsNotProfane()
  name: string;

  @IsRequired(ValidationErrorCode.EMAIL_REQUIRED)
  @IsEmailField(ValidationErrorCode.EMAIL_INVALID_FORMAT)
  @IsNotProfane()
  email: string;

  @IsRequired(ValidationErrorCode.PASSWORD_REQUIRED)
  @IsStrongPassword()
  password: string;
}
