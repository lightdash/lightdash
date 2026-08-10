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
        fs.writeFile(path.join(ossDirectory, '001_oss.ts'), ''),
        fs.writeFile(path.join(ossDirectory, 'ignored.js'), ''),
        fs.writeFile(path.join(eeDirectory, '002_ee.ts'), ''),
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
            pending: ['001_oss.ts', '002_ee.ts'],
            missing: [],
            databaseAhead: false,
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
                { name: '001_oss.ts' },
                { name: '003_database_only.ts' },
            ]);

        const state = await getKnexMigrationState(database, {
            directory: [ossDirectory, eeDirectory],
            loadExtensions: ['.ts'],
            tableName: 'knex_migrations',
        });

        expect(state).toEqual({
            completed: ['001_oss.ts', '003_database_only.ts'],
            pending: ['002_ee.ts'],
            missing: ['003_database_only.ts'],
            databaseAhead: true,
        });
    });
});
