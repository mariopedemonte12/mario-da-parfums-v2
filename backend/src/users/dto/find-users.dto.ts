import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Role } from '../../shared/enums/role.enums.js';
import { ValidationErrorCode } from '../../shared/enums/validation-error-code.enums.js';
import { IsEnumField } from '../../validators/wrappers/is-enum.wrapper.js';
import { IsNoNul } from '../../validators/is-no-nul.validator.js';
import { IsStringField } from '../../validators/wrappers/is-string.wrapper.js';

export class FindUsersDto {
  @ApiPropertyOptional({
    description: 'Case-insensitive partial match on user name',
  })
  @IsOptional()
  @IsStringField()
  @IsNoNul()
  name?: string;

  @ApiPropertyOptional({
    description: 'Case-insensitive partial match on user email',
  })
  @IsOptional()
  @IsStringField()
  @IsNoNul()
  email?: string;

  @ApiPropertyOptional({ enum: Role, description: 'Exact match on role' })
  @IsOptional()
  @IsEnumField(Role, ValidationErrorCode.ROLE_INVALID)
  role?: Role;

  @ApiPropertyOptional({
    description: 'Page number, 1-indexed',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
