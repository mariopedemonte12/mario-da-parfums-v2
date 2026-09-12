import { ApiProperty } from '@nestjs/swagger';

export class FavoriteCountDto {
  @ApiProperty({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' })
  fragranceId: string;

  @ApiProperty({
    example: 12,
    description: 'Number of users who have this fragrance marked as favorite',
  })
  favoritesCount: number;
}
