import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BatchItemResultDto {
  @ApiPropertyOptional({
    description: 'Id of the vendor this result refers to, when known',
  })
  id?: number;

  @ApiProperty({ description: 'Whether this item succeeded' })
  success: boolean;

  @ApiPropertyOptional({
    description: 'Failure reason, present only when success is false',
  })
  error?: string;
}

export class BatchResultDto {
  @ApiProperty({ type: [BatchItemResultDto] })
  results: BatchItemResultDto[];
}
