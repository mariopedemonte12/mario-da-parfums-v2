import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty } from 'class-validator';
import { ValidationErrorCode } from '../../shared/enums/validation-error-code.enums.js';
import { IsUuidField } from '../../validators/wrappers/is-uuid.wrapper.js';
import { buildErrorMessage } from '../../validators/helpers/build-error-message.js';

export class CreateFavoriteBatchDto {
  @ApiProperty({
    type: [String],
    example: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'],
    description: 'Fragrance ids to mark as favorite for the caller',
  })
  @ArrayNotEmpty({
    message: buildErrorMessage({
      code: ValidationErrorCode.FRAGRANCE_IDS_REQUIRED,
    }),
  })
  @IsUuidField(ValidationErrorCode.FRAGRANCE_ID_INVALID_FORMAT, {
    each: true,
  })
  fragranceIds: string[];
}
