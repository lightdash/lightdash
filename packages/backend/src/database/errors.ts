import { DatabaseError } from 'pg';

export const isUniqueConstraintViolation = (error: unknown): boolean =>
    error instanceof DatabaseError && error.code === '23505';

export const isStatementTimeout = (error: unknown): boolean =>
    error instanceof DatabaseError && error.code === '57014';

// lock_not_available, raised when lock_timeout runs out while waiting for a lock
export const isLockTimeout = (error: unknown): boolean =>
    error instanceof DatabaseError && error.code === '55P03';
