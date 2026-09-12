import { Role } from '../../shared/enums/role.enums.js';
import { ValidationErrorCode } from '../../shared/enums/validation-error-code.enums.js';
import { IsStringField } from '../../validators/wrappers/is-string.wrapper.js';
import { IsStrongPassword } from '../../validators/is-password-strong.validator.js';
import { IsEmailField } from '../../validators/wrappers/is-email.wrapper.js';
import { IsEnumField } from '../../validators/wrappers/is-enum.wrapper.js';
import { IsNotProfane } from '../../validators/is-not-profane.validator.js';
import { IsRequired } from '../../validators/wrappers/is-not-empty.wrapper.js';

// Admin-only account creation — the one difference from RegisterDto is
// `role`, which public registration never accepts (see AuthsService.register).
export class AdminCreateUserDto {
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

  @IsEnumField(Role, ValidationErrorCode.ROLE_INVALID)
  role: Role;
}
