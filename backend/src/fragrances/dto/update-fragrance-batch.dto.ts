import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsUUID, ValidateNested } from 'class-validator';
import { UpdateFragranceDto } from './update-fragrance.dto.js';

export class UpdateFragranceBatchItemDto extends UpdateFragranceDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  @IsUUID()
  id: string;
}

export class UpdateFragranceBatchDto {
  @ApiProperty({ type: [UpdateFragranceBatchItemDto] })
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => UpdateFragranceBatchItemDto)
  items: UpdateFragranceBatchItemDto[];
}
