import { Type } from 'class-transformer';
import { ArrayMinSize, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CreateVendorDto } from './create-vendor.dto.js';

export class BatchCreateVendorsDto {
  @ApiProperty({ type: [CreateVendorDto], minItems: 1 })
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateVendorDto)
  items: CreateVendorDto[];
}
