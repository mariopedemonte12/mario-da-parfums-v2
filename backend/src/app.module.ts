import { Module } from '@nestjs/common';
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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtConfigModule,
    UsersModule,
    DatabaseModule,
    FragrancesModule,
    VendorsModule,
    ListingsModule,
    PasswordsModule,
    AuthsModule,
    FavoritesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
