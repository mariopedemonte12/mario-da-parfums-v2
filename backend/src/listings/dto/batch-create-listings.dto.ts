import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, ValidateNested } from 'class-validator';
import { CreateListingDto } from './create-listing.dto.js';

export class BatchCreateListingsDto {
  @ApiProperty({ type: [CreateListingDto], minItems: 1 })
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateListingDto)
  items: CreateListingDto[];
}
