import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';

jest.mock('https');
jest.mock('./knexfile', () => ({
    __esModule: true,
    default: { development: {}, production: {} },
}));

// eslint-disable-next-line import/first
import { resolveMigrationFile } from './migrateOrRollbackDatabase';

const TEMP_DIR = path.join(__dirname, '..', '..', 'temp_migrations');
const mockedGet = https.get as unknown as jest.Mock;

function mockHttpsGet(statusCode: number, body: string) {
    mockedGet.mockImplementation((_url: unknown, cb: unknown) => {
        const res = new EventEmitter() as EventEmitter & {
            statusCode: number;
        };
        res.statusCode = statusCode;
        process.nextTick(() => {
            (cb as (r: typeof res) => void)(res);
            res.emit('data', body);
            res.emit('end');
        });
        return new EventEmitter();
    });
    return mockedGet;
}

afterEach(() => {
    jest.clearAllMocks();
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
});

describe('resolveMigrationFile', () => {
    it('uses the local EE migration file when present (license-removed case)', async () => {
        const name = '20231214111216_embedding.ts';
        const result = await resolveMigrationFile(name);

        expect(result).toBe(path.join(TEMP_DIR, name));
        expect(fs.readFileSync(result, 'utf8')).toContain(
            'export async function up',
        );
    });

    it('downloads and transpiles .ts from GitHub when absent locally (version-downgrade case)', async () => {
        const tsSource = [
            "import { Knex } from 'knex';",
            'export async function up(knex: Knex): Promise<void> {',
            "    await knex.raw('SELECT 1');",
            '}',
            'export async function down(knex: Knex): Promise<void> {',
            "    await knex.raw('SELECT 2');",
            '}',
        ].join('\n');
        const spy = mockHttpsGet(200, tsSource);

        const name = '99999999999999_absent_locally.js';
        const result = await resolveMigrationFile(name);

        expect(result).toBe(path.join(TEMP_DIR, name));
        // It must request the .ts source, not the (uncommitted) .js artifact
        expect(String(spy.mock.calls[0][0])).toContain(
            'database/migrations/99999999999999_absent_locally.ts',
        );

        const compiled = fs.readFileSync(result, 'utf8');
        expect(compiled).not.toContain(': Promise<void>'); // types stripped
        // eslint-disable-next-line import/no-dynamic-require, global-require
        const mod = require(result);
        expect(typeof mod.up).toBe('function');
        expect(typeof mod.down).toBe('function');
    });

    it('throws when the migration is found neither locally nor on GitHub', async () => {
        mockHttpsGet(404, '404: Not Found');

        await expect(
            resolveMigrationFile('88888888888888_missing.js'),
        ).rejects.toThrow(/not found in the local image or on GitHub/);
    });
});
