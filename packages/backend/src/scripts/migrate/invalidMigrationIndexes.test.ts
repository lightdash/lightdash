import knex, { type Knex } from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanupInvalidMigrationIndexes } from './invalidMigrationIndexes';

let database: Knex;
let tracker: Tracker;
let temporaryDirectory: string;
let ossDirectory: string;
let eeDirectory: string;

const pendingMigration = '20260810120000_pending.ts';
const otherPendingMigration = '20260810130000_other.ts';
const completedMigration = '20260810110000_completed.ts';

beforeAll(() => {
    database = knex({ client: MockClient, dialect: 'pg' });
    tracker = getTracker();
});

beforeEach(async () => {
    temporaryDirectory = await fs.mkdtemp(
        path.join(os.tmpdir(), 'lightdash-invalid-migration-indexes-'),
    );
    ossDirectory = path.join(temporaryDirectory, 'oss');
    eeDirectory = path.join(temporaryDirectory, 'ee');
    await Promise.all([fs.mkdir(ossDirectory), fs.mkdir(eeDirectory)]);
});

afterEach(async () => {
    tracker.reset();
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
});

afterAll(async () => {
    await database.destroy();
});

describe('cleanupInvalidMigrationIndexes', () => {
    test('drops deduplicated invalid indexes declared by pending migrations', async () => {
        await Promise.all([
            fs.writeFile(
                path.join(ossDirectory, pendingMigration),
                `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS pending_invalid_idx ON users (id);
                 CREATE INDEX CONCURRENTLY valid_pending_idx ON users (email);
                 CREATE INDEX CONCURRENTLY pending_invalid_idx ON users (id);
                 CREATE INDEX CONCURRENTLY "Pending""Quoted" ON users (id);`,
            ),
            fs.writeFile(
                path.join(eeDirectory, otherPendingMigration),
                'CREATE INDEX CONCURRENTLY ee_invalid_idx ON organizations (id);',
            ),
        ]);
        tracker.on.any(/FROM pg_index/).response({
            rows: [
                { name: 'pending_invalid_idx' },
                { name: 'pending_invalid_idx' },
                { name: 'Pending"Quoted' },
                { name: 'unrelated_invalid_idx' },
            ],
        });
        tracker.on.any(/^DROP INDEX/).response({});
        const log = vi.fn<(message: string) => void>();

        await cleanupInvalidMigrationIndexes({
            database,
            migrationConfig: {
                directory: [ossDirectory, eeDirectory],
                loadExtensions: ['.ts'],
            },
            pendingMigrationNames: [pendingMigration, otherPendingMigration],
            log,
        });

        const dropQueries = tracker.history.all.filter(({ sql }) =>
            sql.startsWith('DROP INDEX'),
        );
        expect(dropQueries.map(({ sql }) => sql)).toEqual([
            'DROP INDEX CONCURRENTLY IF EXISTS "pending_invalid_idx"',
            'DROP INDEX CONCURRENTLY IF EXISTS "Pending""Quoted"',
        ]);
        expect(log).toHaveBeenCalledTimes(2);
        expect(log).toHaveBeenCalledWith(
            'Dropping invalid index left by pending migration: pending_invalid_idx',
        );
        expect(log).toHaveBeenCalledWith(
            'Dropping invalid index left by pending migration: Pending"Quoted',
        );
    });

    test('does not drop valid or unrelated invalid indexes', async () => {
        await Promise.all([
            fs.writeFile(
                path.join(ossDirectory, pendingMigration),
                `CREATE INDEX CONCURRENTLY valid_pending_idx ON users (id);
                 CREATE INDEX CONCURRENTLY pending_invalid_idx ON users (email);`,
            ),
            fs.writeFile(
                path.join(ossDirectory, completedMigration),
                'CREATE INDEX CONCURRENTLY unrelated_invalid_idx ON users (id);',
            ),
        ]);
        tracker.on.any(/FROM pg_index/).response({
            rows: [{ name: 'unrelated_invalid_idx' }],
        });
        const log = vi.fn<(message: string) => void>();

        await cleanupInvalidMigrationIndexes({
            database,
            migrationConfig: {
                directory: ossDirectory,
                extension: 'ts',
            },
            pendingMigrationNames: [pendingMigration],
            log,
        });

        expect(tracker.history.all).toHaveLength(1);
        expect(tracker.history.all[0].bindings).toEqual([
            'valid_pending_idx',
            'pending_invalid_idx',
        ]);
        expect(log).not.toHaveBeenCalled();
    });

    test('ignores prose and identifier placeholders', async () => {
        await fs.writeFile(
            path.join(ossDirectory, pendingMigration),
            `CREATE INDEX CONCURRENTLY can leave an invalid index behind.
             await knex.raw('CREATE INDEX CONCURRENTLY IF NOT EXISTS ?? ON ?? (id)', [indexName, tableName]);`,
        );
        const log = vi.fn<(message: string) => void>();

        await cleanupInvalidMigrationIndexes({
            database,
            migrationConfig: {
                directory: ossDirectory,
                loadExtensions: ['ts'],
            },
            pendingMigrationNames: [pendingMigration],
            log,
        });

        expect(tracker.history.all).toEqual([]);
        expect(log).not.toHaveBeenCalled();
    });
});
