import { PartialType } from '@nestjs/mapped-types';
import { CreateListingDto } from './create-listing.dto.js';

export class UpdateListingDto extends PartialType(CreateListingDto) {}
