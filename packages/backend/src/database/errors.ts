import { DatabaseError } from 'pg';

export const isUniqueConstraintViolation = (error: unknown): boolean =>
    error instanceof DatabaseError && error.code === '23505';

export const isStatementTimeout = (error: unknown): boolean =>
    error instanceof DatabaseError && error.code === '57014';
