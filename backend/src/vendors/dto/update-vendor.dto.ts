import { PartialType } from '@nestjs/swagger';
import { CreateVendorDto } from './create-vendor.dto.js';

export class UpdateVendorDto extends PartialType(CreateVendorDto) {}
