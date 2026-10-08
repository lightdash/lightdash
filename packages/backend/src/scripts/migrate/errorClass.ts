import { type MigrationErrorClass } from '../../database/migrationLease';

const LOCK_NOT_AVAILABLE_ERROR_CODE = '55P03';
const DEADLOCK_DETECTED_ERROR_CODE = '40P01';
const TRANSIENT_POSTGRES_ERROR_CODES = new Set([
    LOCK_NOT_AVAILABLE_ERROR_CODE,
    DEADLOCK_DETECTED_ERROR_CODE,
]);
const MAX_ERROR_CHAIN_DEPTH = 5;

const getPostgresErrorCodes = (error: unknown, depth = 0): string[] => {
    if (
        typeof error !== 'object' ||
        error === null ||
        depth >= MAX_ERROR_CHAIN_DEPTH
    ) {
        return [];
    }
    const code: unknown = Reflect.get(error, 'code');
    const ownCodes =
        typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? [code] : [];
    return [
        ...ownCodes,
        ...getPostgresErrorCodes(Reflect.get(error, 'nativeError'), depth + 1),
        ...getPostgresErrorCodes(Reflect.get(error, 'cause'), depth + 1),
    ];
};

export const classifyMigrationError = (error: unknown): MigrationErrorClass =>
    getPostgresErrorCodes(error).some((code) =>
        TRANSIENT_POSTGRES_ERROR_CODES.has(code),
    )
        ? 'transient'
        : 'deterministic';

export const isLockTimeoutError = (error: unknown): boolean =>
    getPostgresErrorCodes(error).includes(LOCK_NOT_AVAILABLE_ERROR_CODE);
