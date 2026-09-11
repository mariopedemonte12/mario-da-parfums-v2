import { Role } from '../../shared/enums/role.enums.js';

export interface JwtPayload {
    sub: number;
    email: string;
    role: Role;
}
