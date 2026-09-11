import {
    pgTable,
    serial,
    varchar,
    text,
    integer,
    boolean,
    timestamp,
    date,
    numeric,
    pgEnum,
    uuid,
} from 'drizzle-orm/pg-core';
import { Role } from '../../shared/enums/role.enums.js';

export const roleEnum = pgEnum('role', [Role.USER, Role.ADMIN]);

export const users = pgTable('users', {
    id: serial('id').primaryKey(),
    name: varchar('name', {length: 255}).notNull().unique(),
    email: varchar('email', {length: 255}).notNull().unique(),
    role: roleEnum().notNull().default(Role.USER),
    passwordHash: varchar('password_hash', {length: 255}).notNull(),
    photoS3Key: varchar('photo_s3_key', {length: 255}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
})

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;