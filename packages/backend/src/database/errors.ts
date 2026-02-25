import { DatabaseError } from 'pg';

export const isUniqueConstraintViolation = (error: unknown): boolean =>
    error instanceof DatabaseError && error.code === '23505';
