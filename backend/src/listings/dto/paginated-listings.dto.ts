import { ApiProperty } from '@nestjs/swagger';
import { ResponseListingDto } from './response-listing.dto.js';

// Cursor pagination, not offset: no `total`/`page`/`totalPages` (see
// specs/query-performance.md — an exact total would require running the
// full count() this shape exists to avoid). `nextCursor` is the id of the
// last row returned, to pass back as `cursor` on the next request; `null`
// once a page comes back shorter than `limit`.
export class PaginatedListingsDto {
  @ApiProperty({ type: [ResponseListingDto] })
  data: ResponseListingDto[];

  @ApiProperty({ example: 42, nullable: true })
  nextCursor: number | null;
}
