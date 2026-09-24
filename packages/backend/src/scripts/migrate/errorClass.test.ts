import { DatabaseError } from 'pg';
import { classifyMigrationError, isLockTimeoutError } from './errorClass';

const databaseError = (code: string): DatabaseError =>
    Object.assign(new DatabaseError('database failure', 0, 'error'), {
        code,
    });

describe('classifyMigrationError', () => {
    test.each([
        ['lock_not_available', '55P03'],
        ['deadlock_detected', '40P01'],
    ])('classifies %s as transient', (_name, code) => {
        expect(classifyMigrationError(databaseError(code))).toEqual(
            'transient',
        );
    });

    test.each([
        ['query_canceled', '57014'],
        ['unique_violation', '23505'],
        ['undefined_table', '42P01'],
        ['connection_failure', '08006'],
    ])('classifies %s as deterministic', (_name, code) => {
        expect(classifyMigrationError(databaseError(code))).toEqual(
            'deterministic',
        );
    });

    test('finds a transient code on a wrapped native error', () => {
        const wrapped = Object.assign(new Error('migration failed'), {
            nativeError: databaseError('55P03'),
        });

        expect(classifyMigrationError(wrapped)).toEqual('transient');
    });

    test('finds a transient code on an error cause', () => {
        const wrapped = new Error('migration failed', {
            cause: new Error('query failed', { cause: databaseError('40P01') }),
        });

        expect(classifyMigrationError(wrapped)).toEqual('transient');
    });

    test.each([
        new Error('plain failure'),
        Object.assign(new Error('bad code'), { code: 'ECONNRESET' }),
        'string failure',
        null,
        undefined,
    ])('classifies %s without a Postgres code as deterministic', (error) => {
        expect(classifyMigrationError(error)).toEqual('deterministic');
    });

    test('stops following a cyclic cause chain', () => {
        const error = new Error('cyclic');
        Object.assign(error, { cause: error });

        expect(classifyMigrationError(error)).toEqual('deterministic');
    });
});

describe('isLockTimeoutError', () => {
    test('matches only lock_not_available', () => {
        expect(isLockTimeoutError(databaseError('55P03'))).toBe(true);
        expect(
            isLockTimeoutError(
                Object.assign(new Error('wrapped'), {
                    nativeError: databaseError('55P03'),
                }),
            ),
        ).toBe(true);
        expect(isLockTimeoutError(databaseError('40P01'))).toBe(false);
        expect(isLockTimeoutError(new Error('plain failure'))).toBe(false);
    });
});
