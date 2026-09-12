import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

@Injectable()
export class PasswordsService {
  private readonly options: argon2.HashOptions = {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  };

  async hash(plainPassword: string): Promise<string> {
    return argon2.hash(plainPassword, this.options);
  }

  async verify(hash: string, plainPassword: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plainPassword);
    } catch {
      return false;
    }
  }
}
