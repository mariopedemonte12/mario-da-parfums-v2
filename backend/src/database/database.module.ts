import { Module, Global, OnModuleDestroy, Inject } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/index.js';

export const DRIZZLE = Symbol('DRIZZLE_CONNECTION');
export const PG_POOL = Symbol('PG_POOL');

export type Database = NodePgDatabase<typeof schema>;

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        return new Pool({
          connectionString: configService.get<string>('DATABASE_URL'),
        });
      },
    },
    {
      provide: DRIZZLE,
      inject: [PG_POOL],
      useFactory: (pool: Pool): NodePgDatabase<typeof schema> => {
        return drizzle(pool, { schema });
      },
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(PG_POOL) private pool: Pool) {}

  async onModuleDestroy() {
    await this.pool.end();
  }
}
