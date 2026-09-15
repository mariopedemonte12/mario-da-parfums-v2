import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CreateVendorDto } from './create-vendor.dto.js';

// Deliberately no @ValidateNested here: per-item schema errors (e.g. an
// empty name) are validated manually in VendorsService so they only fail
// that item, per the spec's partial-success semantics — validating nested
// items through the global pipe would reject the whole batch on one bad
// item. @ArrayMinSize/@ArrayMaxSize still apply globally since "items
// non-empty"/"items within cap" are batch-envelope requirements, not
// per-item ones.
export class BatchCreateVendorsDto {
  @ApiProperty({ type: [CreateVendorDto], minItems: 1, maxItems: 100 })
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @Type(() => CreateVendorDto)
  items: CreateVendorDto[];
}
