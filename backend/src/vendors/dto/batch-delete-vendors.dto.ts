import { ApiProperty } from '@nestjs/swagger';
import { ArrayMinSize, IsInt } from 'class-validator';

export class BatchDeleteVendorsDto {
  @ApiProperty({ type: [Number], minItems: 1, example: [1, 2, 3] })
  @ArrayMinSize(1)
  @IsInt({ each: true })
  ids: number[];
}
