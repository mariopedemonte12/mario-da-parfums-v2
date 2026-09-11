import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsUUID } from 'class-validator';

export class DeleteFragranceBatchDto {
  @ApiProperty({
    type: [String],
    example: ['3fa85f64-5717-4562-b3fc-2c963f66afa6'],
  })
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  ids: string[];
}
