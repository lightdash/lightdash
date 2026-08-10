import knex, { type Knex } from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getKnexMigrationState } from './migrationState';

let database: Knex;
let tracker: Tracker;
let temporaryDirectory: string;
let ossDirectory: string;
let eeDirectory: string;

const ossMigration = '20260810120000_oss.ts';
const eeMigration = '20260810160000_ee.ts';
const futureDatabaseMigration = '20260811120000_future_database_only.ts';

beforeAll(async () => {
    database = knex({ client: MockClient, dialect: 'pg' });
    tracker = getTracker();
    temporaryDirectory = await fs.mkdtemp(
        path.join(os.tmpdir(), 'lightdash-migration-state-'),
    );
    ossDirectory = path.join(temporaryDirectory, 'oss');
    eeDirectory = path.join(temporaryDirectory, 'ee');
    await Promise.all([fs.mkdir(ossDirectory), fs.mkdir(eeDirectory)]);
    await Promise.all([
        fs.writeFile(path.join(ossDirectory, ossMigration), ''),
        fs.writeFile(path.join(ossDirectory, 'ignored.js'), ''),
        fs.writeFile(path.join(eeDirectory, eeMigration), ''),
    ]);
});

afterEach(() => {
    tracker.reset();
});

afterAll(async () => {
    await Promise.all([
        database.destroy(),
        fs.rm(temporaryDirectory, { recursive: true, force: true }),
    ]);
});

describe('getKnexMigrationState', () => {
    test('enumerates OSS and EE directories without creating an absent migrations table', async () => {
        tracker.on.any(/information_schema\.tables/).response(false);

        const state = await getKnexMigrationState(database, {
            directory: [ossDirectory, eeDirectory],
            loadExtensions: ['.ts'],
            tableName: 'knex_migrations',
        });

        expect(state).toEqual({
            completed: [],
            pending: [ossMigration, eeMigration],
            missing: [],
            offending: [],
            classification: 'database-behind',
        });
        expect(
            tracker.history.all.every(
                ({ sql }) =>
                    !sql.toLowerCase().includes('create table') &&
                    !sql.toLowerCase().includes('insert into'),
            ),
        ).toBe(true);
    });

    test('reports database-ahead migrations as missing while retaining local pending files', async () => {
        tracker.on.any(/information_schema\.tables/).response(true);
        tracker.on
            .select('knex_migrations')
            .response([
                { name: ossMigration },
                { name: futureDatabaseMigration },
            ]);

        const state = await getKnexMigrationState(database, {
            directory: [ossDirectory, eeDirectory],
            loadExtensions: ['.ts'],
            tableName: 'knex_migrations',
        });

        expect(state).toEqual({
            completed: [ossMigration, futureDatabaseMigration],
            pending: [eeMigration],
            missing: [futureDatabaseMigration],
            offending: [],
            classification: 'database-ahead',
        });
    });

    test('classifies database-only migrations within the local range as diverged', async () => {
        tracker.on.any(/information_schema\.tables/).response(true);
        tracker.on
            .select('knex_migrations')
            .response([
                { name: '20260809120000_database_only.ts' },
                { name: ossMigration },
                { name: '20260810130000_alien.ts' },
                { name: '20260811120000_database_only.ts' },
            ]);

        const state = await getKnexMigrationState(database, {
            directory: [ossDirectory, eeDirectory],
            loadExtensions: ['.ts'],
            tableName: 'knex_migrations',
        });

        expect(state).toEqual({
            completed: [
                '20260809120000_database_only.ts',
                ossMigration,
                '20260810130000_alien.ts',
                '20260811120000_database_only.ts',
            ],
            pending: [eeMigration],
            missing: [
                '20260809120000_database_only.ts',
                '20260810130000_alien.ts',
                '20260811120000_database_only.ts',
            ],
            offending: [
                '20260809120000_database_only.ts',
                '20260810130000_alien.ts',
            ],
            classification: 'diverged',
        });
    });

    test('classifies a database-only ledger with no local migration maximum as diverged', async () => {
        tracker.on.any(/information_schema\.tables/).response(true);
        tracker.on
            .select('knex_migrations')
            .response([{ name: '20260811120000_database_only.ts' }]);

        const state = await getKnexMigrationState(database, {
            directory: [],
            loadExtensions: ['.ts'],
            tableName: 'knex_migrations',
        });

        expect(state).toEqual({
            completed: ['20260811120000_database_only.ts'],
            pending: [],
            missing: ['20260811120000_database_only.ts'],
            offending: ['20260811120000_database_only.ts'],
            classification: 'diverged',
        });
    });

    test('rejects malformed and impossible database-only migration names even when they sort after local files', async () => {
        tracker.on.any(/information_schema\.tables/).response(true);
        tracker.on
            .select('knex_migrations')
            .response([
                { name: ossMigration },
                { name: eeMigration },
                { name: '99999999999999_impossible.ts' },
                { name: '20991301120000_invalid_month.ts' },
                { name: '20990229120000_invalid_day.ts' },
                { name: 'not_a_timestamp.ts' },
                { name: '20991231235958__invalid_slug.ts' },
                { name: '20991231235959_wrong_extension.js' },
            ]);

        const state = await getKnexMigrationState(database, {
            directory: [ossDirectory, eeDirectory],
            loadExtensions: ['.ts'],
            tableName: 'knex_migrations',
        });

        expect(state.classification).toEqual('diverged');
        expect(state.offending).toEqual([
            '99999999999999_impossible.ts',
            '20991301120000_invalid_month.ts',
            '20990229120000_invalid_day.ts',
            'not_a_timestamp.ts',
            '20991231235958__invalid_slug.ts',
            '20991231235959_wrong_extension.js',
        ]);
    });

    test('rejects a database-only migration with the newest local timestamp', async () => {
        tracker.on.any(/information_schema\.tables/).response(true);
        tracker.on
            .select('knex_migrations')
            .response([
                { name: ossMigration },
                { name: eeMigration },
                { name: '20260810160000_zzz_database_only.ts' },
                { name: '20260811120000_first_database_only.ts' },
                { name: '20260811120000_same_timestamp.ts' },
            ]);

        const state = await getKnexMigrationState(database, {
            directory: [ossDirectory, eeDirectory],
            loadExtensions: ['.ts'],
            tableName: 'knex_migrations',
        });

        expect(state.offending).toEqual([
            '20260810160000_zzz_database_only.ts',
            '20260811120000_same_timestamp.ts',
        ]);
        expect(state.classification).toEqual('diverged');
    });

    test('rejects database-only migrations that are not monotonic in completion order', async () => {
        tracker.on.any(/information_schema\.tables/).response(true);
        tracker.on
            .select('knex_migrations')
            .response([
                { name: ossMigration },
                { name: eeMigration },
                { name: '20260812120000_first_database_only.ts' },
                { name: '20260811120000_non_monotonic.ts' },
            ]);

        const state = await getKnexMigrationState(database, {
            directory: [ossDirectory, eeDirectory],
            loadExtensions: ['.ts'],
            tableName: 'knex_migrations',
        });

        expect(state.missing).toEqual([
            '20260812120000_first_database_only.ts',
            '20260811120000_non_monotonic.ts',
        ]);
        expect(state.offending).toEqual(['20260811120000_non_monotonic.ts']);
        expect(state.classification).toEqual('diverged');
    });
});
