import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from './database/database.module.js';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { UsersModule } from './users/users.module.js';
import { FragrancesModule } from './fragrances/fragrances.module.js';
import { VendorsModule } from './vendors/vendors.module.js';
import { ListingsModule } from './listings/listings.module.js';
import { PasswordsModule } from './passwords/passwords.module.js';
import { AuthsModule } from './auths/auths.module.js';
import { JwtConfigModule } from './auths/jwt-config.module.js';
import { FavoritesModule } from './favorites/favorites.module.js';
import { McpModule } from './mcp/mcp.module.js';

// A single e2e test file can fire far more than 100 requests at the same
// client IP well inside a 60s window (see specs/security-hardening.md, §1
// "Test environment") — the global limit is relaxed under vitest so the
// guard stays real and wired in e2e without tripping unrelated tests.
const THROTTLE_LIMIT = process.env.NODE_ENV === 'test' ? 100_000 : 100;

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: THROTTLE_LIMIT }]),
    JwtConfigModule,
    UsersModule,
    DatabaseModule,
    FragrancesModule,
    VendorsModule,
    ListingsModule,
    PasswordsModule,
    AuthsModule,
    FavoritesModule,
    McpModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
