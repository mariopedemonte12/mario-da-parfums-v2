import { Expose, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UpdateVendorDto } from './update-vendor.dto.js';

export class UpdateVendorItemDto extends UpdateVendorDto {
  @ApiProperty({ description: 'Id of the vendor to update', example: 1 })
  @Expose()
  @IsInt()
  id: number;
}

// Deliberately no @ValidateNested here: per-item schema errors are
// validated manually in VendorsService so they only fail that item, per
// the spec's partial-success semantics — see batch-create-vendors.dto.ts.
export class BatchUpdateVendorsDto {
  @ApiProperty({ type: [UpdateVendorItemDto], minItems: 1, maxItems: 100 })
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @Type(() => UpdateVendorItemDto)
  items: UpdateVendorItemDto[];
}
