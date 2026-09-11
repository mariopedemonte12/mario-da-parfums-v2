import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, ValidateNested } from 'class-validator';
import { CreateFragranceDto } from './create-fragrance.dto.js';

export class CreateFragranceBatchDto {
  @ApiProperty({ type: [CreateFragranceDto] })
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateFragranceDto)
  items: CreateFragranceDto[];
}
