import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class UserResponseDto {
    @Expose()
    id: string;

    @Expose()
    name: string;

    @Expose()
    email: string;

    @Expose()
    role: string;

    @Expose()
    photoS3Key: string;

    @Expose()
    createdAt: Date;
}