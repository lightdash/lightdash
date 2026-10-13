import { DimensionType } from '@lightdash/common';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { DuckdbWarehouseClient } from './DuckdbWarehouseClient';

describe.sequential('DuckdbWarehouseClient local files', () => {
    let workDirectory: string;
    let inputDirectory: string;
    let tempDirectory: string;

    beforeEach(async () => {
        workDirectory = await fs.mkdtemp(
            path.join(os.tmpdir(), 'lightdash-duckdb-local-'),
        );
        inputDirectory = path.join(workDirectory, 'in');
        tempDirectory = path.join(workDirectory, 'tmp');
        await fs.mkdir(inputDirectory);
        await fs.mkdir(tempDirectory);
        await fs.writeFile(
            path.join(inputDirectory, 'orders.jsonl'),
            '{"id":1,"status":"placed"}\n{"id":2,"status":"shipped"}\n',
        );
        await fs.writeFile(
            path.join(workDirectory, 'secret.jsonl'),
            '{"secret":"value"}\n',
        );
    });

    afterEach(async () => {
        await fs.rm(workDirectory, { recursive: true, force: true });
    });

    const createClient = () =>
        DuckdbWarehouseClient.createForLocalFiles({
            inputDirectory,
            tempDirectory,
            memoryLimit: '256MB',
            threads: 1,
        });

    const runQuery = async (client: DuckdbWarehouseClient, sql: string) => {
        const rows: Record<string, unknown>[] = [];
        let fields = {};
        await client.streamQuery(sql, (results) => {
            fields = results.fields;
            rows.push(...results.rows);
        });
        return { rows, fields };
    };

    it('reads a JSONL file inside the input directory', async () => {
        const result = await runQuery(
            createClient(),
            `SELECT * FROM read_json('${inputDirectory}/orders.jsonl', columns={"id": 'INTEGER', "status": 'VARCHAR'}, format='newline_delimited') ORDER BY id`,
        );

        expect(result.rows).toEqual([
            { id: 1, status: 'placed' },
            { id: 2, status: 'shipped' },
        ]);
        expect(result.fields).toEqual({
            id: {
                type: DimensionType.NUMBER,
                numericKind: { kind: 'integer' },
            },
            status: { type: DimensionType.STRING },
        });
    });

    it.each([
        [
            'a file outside the input directory',
            () => `${workDirectory}/secret.jsonl`,
        ],
        [
            'a path that traverses out of the input directory',
            () => `${inputDirectory}/../secret.jsonl`,
        ],
        ['a system file', () => '/etc/hosts'],
    ])('refuses to read %s', async (_label, filePath) => {
        await expect(
            runQuery(
                createClient(),
                `SELECT * FROM read_text('${filePath()}')`,
            ),
        ).rejects.toThrow(/Permission Error/);
    });

    it('refuses remote reads', async () => {
        await expect(
            runQuery(
                createClient(),
                `SELECT * FROM read_text('https://example.com/data.csv')`,
            ),
        ).rejects.toThrow();
    });

    it.each([
        ['the input directory', () => `${inputDirectory}/copy.csv`],
        ['the temp directory', () => `${tempDirectory}/copy.csv`],
        ['outside the allowed directories', () => `${workDirectory}/copy.csv`],
    ])('refuses to write a file into %s', async (_label, filePath) => {
        await expect(
            runQuery(createClient(), `COPY (SELECT 1) TO '${filePath()}'`),
        ).rejects.toThrow();

        await expect(fs.access(filePath())).rejects.toThrow();
    });

    it.each([
        `SET allowed_directories = ['/']`,
        'SET enable_external_access = true',
        'SET lock_configuration = false',
        `SELECT 1; SET allowed_directories = ['/']`,
    ])('cannot reverse the lockdown with: %s', async (sql) => {
        const client = createClient();
        await expect(runQuery(client, sql)).rejects.toThrow();

        await expect(
            runQuery(
                client,
                `SELECT * FROM read_text('${workDirectory}/secret.jsonl')`,
            ),
        ).rejects.toThrow(/Permission Error/);
    });

    it('applies the memory limit', async () => {
        const client = DuckdbWarehouseClient.createForLocalFiles({
            inputDirectory,
            tempDirectory,
            memoryLimit: '32MB',
            threads: 1,
        });

        await expect(
            runQuery(
                client,
                'SELECT length(list(x)) AS n FROM range(20000000) t(x)',
            ),
        ).rejects.toThrow(/Out of Memory/);
    });

    it('applies the session timezone before locking the configuration', async () => {
        const rows: Record<string, unknown>[] = [];
        await createClient().streamQuery(
            `SELECT strftime(TIMESTAMPTZ '2024-01-01 12:00:00+00', '%H') AS hour`,
            (results) => {
                rows.push(...results.rows);
            },
            { timezone: 'Asia/Tbilisi' },
        );

        expect(rows).toEqual([{ hour: '16' }]);
    });
});
