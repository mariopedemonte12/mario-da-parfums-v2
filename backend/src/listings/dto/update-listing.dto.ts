import { PartialType } from '@nestjs/swagger';
import { CreateListingDto } from './create-listing.dto.js';

export class UpdateListingDto extends PartialType(CreateListingDto) {}
