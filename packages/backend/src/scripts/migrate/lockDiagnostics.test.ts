import knex, { type Knex } from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import {
    findMigrationLockHolders,
    formatMigrationLockHolder,
} from './lockDiagnostics';

let database: Knex;
let tracker: Tracker;

beforeAll(() => {
    database = knex({ client: MockClient, dialect: 'pg' });
    tracker = getTracker();
});

afterEach(() => {
    tracker.reset();
});

afterAll(async () => {
    await database.destroy();
});

describe('findMigrationLockHolders', () => {
    test('reads lock holders under a short statement timeout', async () => {
        tracker.on.any(/SET LOCAL statement_timeout/).response([]);
        tracker.on.any(/FROM pg_locks/).response({
            rows: [
                {
                    pid: 4242,
                    backend_type: 'client backend',
                    state: 'idle in transaction',
                    xact_age_seconds: 9000,
                    relations: 'public.projects',
                    query: 'SELECT 1',
                },
            ],
        });

        await expect(findMigrationLockHolders(database)).resolves.toEqual([
            {
                pid: 4242,
                backendType: 'client backend',
                state: 'idle in transaction',
                transactionAgeSeconds: 9000,
                relations: 'public.projects',
                query: 'SELECT 1',
            },
        ]);
        const statements = tracker.history.any.map(({ sql }) => sql);
        expect(statements[0]).toContain("SET LOCAL statement_timeout = '2s'");
        expect(statements[1]).toContain('pg_stat_activity');
        expect(statements[1]).toContain('held_lock.granted');
    });

    test('rejects when the query does not finish inside the timeout', async () => {
        tracker.on.any(/SET LOCAL statement_timeout/).response([]);
        tracker.on.any(/FROM pg_locks/).response(
            () =>
                new Promise((resolve) => {
                    setTimeout(() => resolve({ rows: [] }), 200);
                }),
        );

        await expect(findMigrationLockHolders(database, 10)).rejects.toThrow(
            'Lock diagnostics timed out after 10ms',
        );
    });
});

describe('formatMigrationLockHolder', () => {
    test('emits one line with a quoted, truncated query', () => {
        const line = formatMigrationLockHolder('001_locked.ts', {
            pid: 4242,
            backendType: null,
            state: null,
            transactionAgeSeconds: null,
            relations: 'public.projects,public.apps',
            query: `UPDATE projects\n SET name = "a" ${'x'.repeat(300)}`,
        });

        expect(line).not.toContain('\n');
        expect(line).toMatch(
            /^MIGRATION_LOCK_HOLDER migration=001_locked\.ts pid=4242 backend_type="unknown" state="unknown" xact_age_seconds=unknown relations=public\.projects,public\.apps query="UPDATE projects SET name = \\"a\\" x+"$/,
        );
        const query = JSON.parse(line.slice(line.indexOf('query=') + 6));
        expect(query).toHaveLength(200);
    });
});
