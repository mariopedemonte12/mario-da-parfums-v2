import { Type } from 'class-transformer';
import { ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { CreateVendorDto } from './create-vendor.dto.js';

// Deliberately no @ValidateNested here: per-item schema errors (e.g. an
// empty name) are validated manually in VendorsService so they only fail
// that item, per the spec's partial-success semantics — validating nested
// items through the global pipe would reject the whole batch on one bad
// item. @ArrayMinSize still applies globally since "items non-empty" is a
// batch-envelope requirement, not a per-item one.
export class BatchCreateVendorsDto {
  @ApiProperty({ type: [CreateVendorDto], minItems: 1 })
  @ArrayMinSize(1)
  @Type(() => CreateVendorDto)
  items: CreateVendorDto[];
}
