import { PartialType } from '@nestjs/mapped-types';
import { CreateVendorDto } from './create-vendor.dto.js';

export class UpdateVendorDto extends PartialType(CreateVendorDto) {}
