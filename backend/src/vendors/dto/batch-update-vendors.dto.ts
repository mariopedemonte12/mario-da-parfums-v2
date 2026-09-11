import { Type } from 'class-transformer';
import { ArrayMinSize, IsInt, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UpdateVendorDto } from './update-vendor.dto.js';

export class UpdateVendorItemDto extends UpdateVendorDto {
  @ApiProperty({ description: 'Id of the vendor to update', example: 1 })
  @IsInt()
  id: number;
}

export class BatchUpdateVendorsDto {
  @ApiProperty({ type: [UpdateVendorItemDto], minItems: 1 })
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateVendorItemDto)
  items: UpdateVendorItemDto[];
}
