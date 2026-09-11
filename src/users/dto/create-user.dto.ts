import { Role } from "../../shared/enums/role.enums.js";
import { ValidationErrorCode } from "../../shared/enums/validation-error-code.enums.js";
import { IsNotProfane } from "../../validators/is-not-profane.validator.js";
import { IsRequired } from "../../validators/wrappers/is-not-empty.wrapper.js";
import { IsStringField } from "../../validators/wrappers/is-string.wrapper.js";
import { IsEmailField } from "../../validators/wrappers/is-email.wrapper.js";
import { IsOptional } from "class-validator";
import { IsEnumField } from "../../validators/wrappers/is-enum.wrapper.js";

export class CreateUserDto {
    @IsRequired(ValidationErrorCode.NAME_REQUIRED)
    @IsStringField(ValidationErrorCode.NAME_INVALID_TYPE)
    @IsNotProfane()
    name: string;

    @IsRequired(ValidationErrorCode.EMAIL_REQUIRED)
    @IsEmailField(ValidationErrorCode.EMAIL_INVALID_FORMAT)
    @IsNotProfane()
    email: string;

    @IsEnumField(Role, ValidationErrorCode.ROLE_INVALID)
    role: Role;

    @IsStringField()
    passwordHash: string;

    @IsOptional()
    @IsStringField(ValidationErrorCode.PHOTO_S3_KEY_INVALID_TYPE)
    photoS3Key?: string;
}