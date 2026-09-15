import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, IsInt } from 'class-validator';

export class BatchDeleteVendorsDto {
  @ApiProperty({ type: [Number], minItems: 1, maxItems: 100, example: [1, 2, 3] })
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsInt({ each: true })
  ids: number[];
}
