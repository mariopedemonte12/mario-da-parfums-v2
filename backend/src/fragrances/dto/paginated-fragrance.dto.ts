import { ApiProperty } from '@nestjs/swagger';
import { ResponseFragranceDto } from './response-fragrance.dto.js';

// Cursor pagination, not offset: no `total`/`page` (see
// specs/query-performance.md — an exact total would require running the
// full count() this shape exists to avoid). `nextCursor` is the id of the
// last row returned, to pass back as `cursor` on the next request; `null`
// once a page comes back shorter than `limit`.
export class PaginatedFragranceDto {
  @ApiProperty({ type: [ResponseFragranceDto] })
  data: ResponseFragranceDto[];

  @ApiProperty({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    nullable: true,
  })
  nextCursor: string | null;
}
