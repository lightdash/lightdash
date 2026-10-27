import { DuckDBInstance } from '@duckdb/node-api';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { gzipSync } from 'zlib';
import { UsageAdditionalHistoryModel } from '../../models/UsageAdditionalHistoryModel';
import type { UsageDimensionsModel } from '../../models/UsageDimensionsModel';
import { UsageHistoryModel } from '../../models/UsageHistoryModel';
import { UsageLegacyHistoryModel } from '../../models/UsageLegacyHistoryModel';
import { UsageQueryHistoryModel } from '../../models/UsageQueryHistoryModel';
import { queryEventsCompactedColumns } from './queryEventsStream';
import {
    QUERY_HISTORY_BACKFILL_EVENT,
    queryHistoryBackfillKey,
} from './queryHistoryBackfill';
import {
    UsageHistoryBackfill,
    usageHistoryCompletionKey,
} from './UsageHistoryBackfill';
import { usageHistoryKey, usageHistorySources } from './usageHistorySources';
import { UsageQueryHistoryBackfill } from './UsageQueryHistoryBackfill';

// The engine and generated Parquet are real. Only transport is redirected to a
// private directory so these regression tests never touch a shared bucket.
const transport = vi.hoisted(() => ({
    directory: '',
    keys: new Set<string>(),
    failUpload: false,
    failMarker: false,
    failListing: false,
    uploads: 0,
}));
vi.mock('../../clients/Aws/S3BaseClient', () => ({
    S3BaseClient: class {
        protected s3 = {
            listObjectsV2: async ({ Prefix }: { Prefix: string }) => {
                if (transport.failListing)
                    throw new Error('private storage credentials');
                return {
                    Contents: [...transport.keys]
                        .filter((key) => key.startsWith(Prefix))
                        .map((Key) => ({ Key })),
                };
            },
            putObject: async ({ Key }: { Key: string }) => {
                if (transport.failMarker) throw new Error('marker unavailable');
                transport.keys.add(Key);
            },
            destroy: vi.fn(),
        };
    },
}));
vi.mock('@aws-sdk/lib-storage', () => ({
    Upload: class {
        constructor(
            private options: {
                params: { Key: string; Body: AsyncIterable<Buffer> };
            },
        ) {}
        async done() {
            const bytes: Buffer[] = [];
            for await (const chunk of this.options.params.Body)
                bytes.push(chunk);
            if (transport.failUpload) throw new Error('private signed URL');
            const filename = path.join(
                transport.directory,
                this.options.params.Key,
            );
            await mkdir(path.dirname(filename), { recursive: true });
            await writeFile(filename, Buffer.concat(bytes));
            transport.keys.add(this.options.params.Key);
            transport.uploads += 1;
        }
    },
}));
vi.mock('@lightdash/warehouses', async () => {
    const { DuckDBInstance: Engine } = await import('@duckdb/node-api');
    return {
        DuckdbWarehouseClient: class {
            private engine = Engine.create(':memory:', {
                threads: '1',
                memory_limit: '128MB',
            });
            async runSqlWithMetrics(sql: string) {
                const instance = await this.engine;
                const connection = await instance.connect();
                try {
                    await connection.run(
                        sql.replaceAll(
                            's3://backfill-test/',
                            `${transport.directory}/`,
                        ),
                    );
                } finally {
                    connection.closeSync();
                }
            }
            async close() {
                (await this.engine).closeSync();
            }
        },
    };
});
vi.mock('./UsageDimensionsRefresher', () => ({
    UsageDimensionsRefresher: class {
        async run() {
            return { refreshed: 5, failed: 0 };
        }
    },
}));

describe('usage history backfill reconciliation', () => {
    const org = '00000000-0000-4000-8000-000000000001';
    const pendingDate = new Date(Date.now() - 86400000)
        .toISOString()
        .slice(0, 10);
    const storage = {
        bucket: 'backfill-test',
        endpoint: 'http://localhost:9000',
        region: 'us-east-1',
    };
    let rows: Record<string, unknown>[];
    const row = (id: string, event = QUERY_HISTORY_BACKFILL_EVENT) => ({
        ...Object.fromEntries(
            queryEventsCompactedColumns.map(({ name }) => [name, null]),
        ),
        org_id: org,
        project_id: 'project',
        query_id: id,
        event_name: event,
        event_ts: '2026-09-01T10:00:00Z',
        status: 'success',
    });
    const backfill = () =>
        new UsageQueryHistoryBackfill(storage, {
            async *getJsonLines() {
                for (const value of rows) yield `${JSON.stringify(value)}\n`;
            },
        });
    const dimensions = {
        async *getOrganizations() {
            yield { organization_id: 1, organization_uuid: org };
        },
        async *getJsonLines() {},
    } as unknown as UsageDimensionsModel;
    const sql = async (statement: string) => {
        const instance = await DuckDBInstance.create(':memory:', {
            threads: '1',
            memory_limit: '128MB',
        });
        const db = await instance.connect();
        try {
            return (await db.runAndReadAll(statement)).getRowObjectsJS();
        } finally {
            db.closeSync();
            instance.closeSync();
        }
    };
    const parquet = async (
        key: string,
        values: Record<string, unknown>[],
        columns = queryEventsCompactedColumns,
    ) => {
        const filename = path.join(transport.directory, key);
        await mkdir(path.dirname(filename), { recursive: true });
        const input = path.join(transport.directory, 'fixture.jsonl');
        await writeFile(
            input,
            values.map((value) => JSON.stringify(value)).join('\n'),
        );
        const defs = columns
            .map(({ name, type }) => `${name}:'${type}'`)
            .join(',');
        await sql(
            `COPY (SELECT * FROM read_json('${input}',format='newline_delimited',columns={${defs}})) TO '${filename}' (FORMAT PARQUET)`,
        );
        transport.keys.add(key);
    };
    const historyRows = () =>
        sql(
            `SELECT query_id FROM read_parquet('${path.join(transport.directory, queryHistoryBackfillKey(org))}',hive_partitioning=false) ORDER BY query_id`,
        );

    beforeEach(async () => {
        transport.directory = await mkdtemp(
            path.join(tmpdir(), 'backfill-test-'),
        );
        transport.keys.clear();
        transport.failUpload = false;
        transport.failListing = false;
        transport.uploads = 0;
        rows = [row('existing'), row('missing'), row('pending')];
        await parquet(
            `events/compacted/org_id=${org}/stream=query_events/dt=2026-09-02/captured.parquet`,
            [row('existing', 'query.completed')],
        );
        const raw = `events/raw/org_id=${org}/stream=query_events/dt=${pendingDate}/pending.jsonl.gz`;
        await mkdir(path.dirname(path.join(transport.directory, raw)), {
            recursive: true,
        });
        await writeFile(
            path.join(transport.directory, raw),
            gzipSync(JSON.stringify(row('pending', 'query.completed'))),
        );
        transport.keys.add(raw);
    });
    afterEach(async () => {
        vi.useRealTimers();
        await rm(transport.directory, { recursive: true, force: true });
    });

    it('skips captured and pending identities, and repeated execution never appends duplicates', async () => {
        await expect(backfill().inspect(org)).resolves.toMatchObject({
            missingQueries: 1,
            existingQueries: 1,
            pendingQueries: 1,
        });
        await backfill().run(org, dimensions);
        expect(await historyRows()).toEqual([{ query_id: 'missing' }]);
        await expect(backfill().inspect(org)).resolves.toMatchObject({
            missingQueries: 0,
            existingQueries: 2,
            pendingQueries: 1,
        });
        await backfill().run(org, dimensions);
        expect(await historyRows()).toEqual([{ query_id: 'missing' }]);
        expect(transport.uploads).toBe(1);
    });

    it('fills older retained history and gaps within captured days for an existing Analytics customer', async () => {
        const captured = [
            {
                ...row('month-start', 'query.completed'),
                event_ts: '2026-09-01T09:00:00Z',
            },
            {
                ...row('same-day-captured', 'query.completed'),
                event_ts: '2026-09-15T09:00:00Z',
            },
            {
                ...row('month-end', 'query.completed'),
                event_ts: '2026-09-30T09:00:00Z',
            },
        ];
        for (const value of captured) {
            // eslint-disable-next-line no-await-in-loop
            await parquet(
                `events/compacted/org_id=${org}/stream=query_events/dt=${value.event_ts.slice(0, 10)}/captured.parquet`,
                [value],
            );
        }
        rows = [
            ...captured.map((value) => ({
                ...value,
                event_name: QUERY_HISTORY_BACKFILL_EVENT,
            })),
            { ...row('older-gap'), event_ts: '2026-08-15T10:00:00Z' },
            { ...row('same-day-gap'), event_ts: '2026-09-15T10:00:00Z' },
        ];
        await expect(backfill().inspect(org)).resolves.toMatchObject({
            missingQueries: 2,
            existingQueries: 3,
            pendingQueries: 0,
            from: '2026-08-15',
            to: '2026-09-15',
        });
        await backfill().run(org, dimensions);
        const expected = [
            { query_id: 'older-gap' },
            { query_id: 'same-day-gap' },
        ];
        expect(await historyRows()).toEqual(expected);
        await expect(backfill().inspect(org)).resolves.toMatchObject({
            missingQueries: 0,
            existingQueries: 5,
            pendingQueries: 0,
            from: null,
            to: null,
        });
        await backfill().run(org, dimensions);
        expect(await historyRows()).toEqual(expected);
        expect(transport.uploads).toBe(1);
    });

    it('passes a full run-start timestamp and includes completed queries from today', async () => {
        const now = new Date('2026-10-26T12:34:56.789Z');
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(now);
        const today = {
            ...row('today-completed'),
            event_ts: '2026-10-26T08:00:00Z',
        };
        const getJsonLines = vi.fn(async function* retainedHistory(
            _org: string,
            before: string,
        ) {
            if (new Date(today.event_ts) < new Date(before)) {
                yield `${JSON.stringify(today)}\n`;
            }
        });
        const importer = new UsageQueryHistoryBackfill(storage, {
            getJsonLines,
        });
        await expect(importer.inspect(org)).resolves.toMatchObject({
            missingQueries: 1,
            from: '2026-10-26',
            to: '2026-10-26',
        });
        expect(getJsonLines).toHaveBeenCalledExactlyOnceWith(
            org,
            now.toISOString(),
        );
        await new UsageQueryHistoryBackfill(storage, { getJsonLines }).run(
            org,
            dimensions,
        );
        expect(await historyRows()).toEqual([{ query_id: 'today-completed' }]);
    });

    it('preserves history after DB retention and tolerates an older additive schema on incremental rerun', async () => {
        await backfill().run(org, dimensions);
        const filename = path.join(
            transport.directory,
            queryHistoryBackfillKey(org),
        );
        const previous = `${filename}.old`;
        await sql(
            `COPY (SELECT * EXCLUDE(warehouse_ssh_tunnel_ms) FROM read_parquet('${filename}',hive_partitioning=false)) TO '${previous}' (FORMAT PARQUET)`,
        );
        await writeFile(filename, await readFile(previous));
        rows = [row('new')];
        await backfill().run(org, dimensions);
        expect(await historyRows()).toEqual([
            { query_id: 'missing' },
            { query_id: 'new' },
        ]);
        await expect(backfill().inspect(org)).resolves.toMatchObject({
            missingQueries: 0,
            existingQueries: 1,
        });
    });

    it('keeps existing published data after upload failure and supports safe retry', async () => {
        await backfill().run(org, dimensions);
        const filename = path.join(
            transport.directory,
            queryHistoryBackfillKey(org),
        );
        const before = await readFile(filename);
        rows.push(row('new'));
        transport.failUpload = true;
        await expect(backfill().run(org, dimensions)).rejects.toThrow(
            'Unable to check or import retained analytics history',
        );
        expect(await readFile(filename)).toEqual(before);
        transport.failUpload = false;
        await backfill().run(org, dimensions);
        expect(await historyRows()).toEqual([
            { query_id: 'missing' },
            { query_id: 'new' },
        ]);
    });

    it("imports raw history outside the processing window while skipping yesterday's pending capture", async () => {
        const oldDate = new Date(Date.now() - 8 * 86400000)
            .toISOString()
            .slice(0, 10);
        const oldRaw = `events/raw/org_id=${org}/stream=query_events/dt=${oldDate}/old.jsonl.gz`;
        await mkdir(path.dirname(path.join(transport.directory, oldRaw)), {
            recursive: true,
        });
        await writeFile(
            path.join(transport.directory, oldRaw),
            gzipSync(JSON.stringify(row('old', 'query.completed'))),
        );
        transport.keys.add(oldRaw);
        rows = [row('old'), row('pending')];

        await expect(backfill().inspect(org)).resolves.toMatchObject({
            missingQueries: 1,
            existingQueries: 0,
            pendingQueries: 1,
        });
        await backfill().run(org, dimensions);
        expect(await historyRows()).toEqual([{ query_id: 'old' }]);
        await expect(backfill().inspect(org)).resolves.toMatchObject({
            missingQueries: 0,
            existingQueries: 1,
            pendingQueries: 1,
        });
        expect(transport.uploads).toBe(1);
    });

    it('does not publish a history file when the retained database history is empty', async () => {
        rows = [];
        const empty = {
            running: false,
            missingQueries: 0,
            existingQueries: 0,
            pendingQueries: 0,
            from: null,
            to: null,
        };
        await expect(backfill().inspect(org)).resolves.toEqual(empty);
        await expect(backfill().run(org, dimensions)).resolves.toEqual(empty);
        expect(transport.uploads).toBe(0);
        expect(transport.keys.has(queryHistoryBackfillKey(org))).toBe(false);
    });

    it('rejects malformed organization identifiers before reading any history', async () => {
        await expect(backfill().inspect('-'.repeat(36))).rejects.toThrow(
            'Invalid organization',
        );
        expect(transport.uploads).toBe(0);
    });

    it('fails closed on storage errors and does not publish or expose provider details', async () => {
        transport.failListing = true;
        await expect(backfill().inspect(org)).rejects.toThrow(
            'Unable to check or import retained analytics history',
        );
        expect(transport.uploads).toBe(0);
    });
    it('resumes a combined import after a later source fails without republishing completed sources', async () => {
        vi.spyOn(
            UsageQueryHistoryModel.prototype,
            'getJsonLines',
        ).mockImplementation(async function* queryRows() {
            yield `${JSON.stringify(row('combined-query'))}\n`;
        });
        vi.spyOn(
            UsageAdditionalHistoryModel.prototype,
            'getAiUsageJsonLines',
        ).mockImplementation(async function* aiRows() {
            yield `${JSON.stringify({ org_id: org, event_id: 'combined-ai', event_ts: '2024-01-01T12:00:00Z', total_tokens: 50, history_origin: 'database' })}\n`;
        });
        let fail = true;
        vi.spyOn(
            UsageLegacyHistoryModel.prototype,
            'getJsonLines',
        ).mockImplementation(async function* legacyRows() {
            if (fail) throw new Error('database unavailable');
            yield `${JSON.stringify({ org_id: org, history_source: 'analytics_chart_views', record_id: 'combined-view', event_ts: '2024-01-01T12:00:00Z' })}\n`;
        });
        vi.spyOn(
            UsageAdditionalHistoryModel.prototype,
            'getActivityJsonLines',
        ).mockImplementation(async function* noAdditionalRows() {
            /* This fixture has no additional facts. */
        });
        try {
            const importer = new UsageHistoryBackfill(
                storage,
                new UsageHistoryModel({} as never),
            );
            await expect(importer.run(org, dimensions)).rejects.toThrow(
                'Unable to check or import retained analytics history',
            );
            expect(transport.uploads).toBe(2);
            expect(transport.keys.has(usageHistoryCompletionKey(org))).toBe(
                false,
            );
            const queryBytes = await readFile(
                path.join(
                    transport.directory,
                    usageHistoryKey(org, 'query_events'),
                ),
            );
            const aiBytes = await readFile(
                path.join(
                    transport.directory,
                    usageHistoryKey(org, 'ai_usage'),
                ),
            );
            fail = false;
            await expect(importer.inspect(org)).resolves.toMatchObject({
                missingRecords: 1,
                existingRecords: 2,
            });
            transport.failMarker = true;
            await expect(importer.run(org, dimensions)).rejects.toThrow(
                'marker unavailable',
            );
            expect(transport.uploads).toBe(3);
            expect(transport.keys.has(usageHistoryCompletionKey(org))).toBe(
                false,
            );
            transport.failMarker = false;
            await importer.run(org, dimensions);
            expect(transport.uploads).toBe(3);
            expect(transport.keys.has(usageHistoryCompletionKey(org))).toBe(
                true,
            );
            expect(
                await readFile(
                    path.join(
                        transport.directory,
                        usageHistoryKey(org, 'query_events'),
                    ),
                ),
            ).toEqual(queryBytes);
            expect(
                await readFile(
                    path.join(
                        transport.directory,
                        usageHistoryKey(org, 'ai_usage'),
                    ),
                ),
            ).toEqual(aiBytes);
            await expect(importer.inspect(org)).resolves.toMatchObject({
                missingRecords: 0,
                existingRecords: 3,
            });
        } finally {
            transport.failMarker = false;
            vi.restoreAllMocks();
        }
    });

    it('reconciles AI ledger events by their shared event ID across captured, pending and imported data', async () => {
        const source = usageHistorySources[1];
        const ai = (id: string) => ({
            org_id: org,
            event_id: id,
            event_name: 'ai.usage',
            event_ts: '2024-01-01T12:00:00Z',
            project_id: null,
            input_tokens: 40,
            output_tokens: 10,
            total_tokens: 50,
            history_origin: 'database',
        });
        rows = [ai('captured'), ai('missing'), ai('pending')];
        await parquet(
            `events/compacted/org_id=${org}/stream=ai_usage/dt=2026-10-01/captured.parquet`,
            [{ ...ai('captured'), total_tokens: 99, history_origin: null }],
            source.columns,
        );
        const raw = `events/raw/org_id=${org}/stream=ai_usage/dt=${pendingDate}/pending.jsonl.gz`;
        await mkdir(path.dirname(path.join(transport.directory, raw)), {
            recursive: true,
        });
        await writeFile(
            path.join(transport.directory, raw),
            gzipSync(JSON.stringify(ai('pending'))),
        );
        transport.keys.add(raw);
        const importer = () =>
            new UsageQueryHistoryBackfill(
                storage,
                {
                    async *getJsonLines() {
                        for (const value of rows)
                            yield `${JSON.stringify(value)}\n`;
                    },
                },
                source,
            );
        await expect(importer().inspect(org)).resolves.toMatchObject({
            missingQueries: 1,
            existingQueries: 1,
            pendingQueries: 1,
        });
        await importer().run(org, dimensions);
        const filename = path.join(
            transport.directory,
            usageHistoryKey(org, 'ai_usage'),
        );
        expect(
            await sql(
                `SELECT event_id, total_tokens, history_origin FROM read_parquet('${filename}', hive_partitioning=false)`,
            ),
        ).toEqual([
            {
                event_id: 'missing',
                total_tokens: 50n,
                history_origin: 'database',
            },
        ]);
        const bytes = await readFile(filename);
        await importer().run(org, dimensions);
        expect(await readFile(filename)).toEqual(bytes);
        expect(transport.uploads).toBe(1);
    });

    it('keeps legacy facts separate, preserves pruned history and updates surviving snapshots without duplicate rows', async () => {
        const source = usageHistorySources[2];
        const fact = (id: string) => ({
            org_id: org,
            history_source: 'analytics_chart_views',
            record_id: id,
            activity_type: 'chart_view_or_execution',
            event_ts: '2024-01-01T12:00:00Z',
            user_id: null,
            content_id: 'same-chart',
            current_status: null,
        });
        rows = [fact('view-1'), fact('view-2')];
        const importer = () =>
            new UsageQueryHistoryBackfill(
                storage,
                {
                    async *getJsonLines() {
                        for (const value of rows)
                            yield `${JSON.stringify(value)}\n`;
                    },
                },
                source,
            );
        await importer().run(org, dimensions);
        const filename = path.join(
            transport.directory,
            usageHistoryKey(org, 'historical_activity'),
        );
        const bytes = await readFile(filename);
        await importer().run(org, dimensions);
        expect(await readFile(filename)).toEqual(bytes);
        expect(transport.uploads).toBe(1);
        rows = [
            fact('view-1'),
            { ...fact('view-2'), current_status: 'updated' },
        ];
        await expect(importer().inspect(org)).resolves.toMatchObject({
            missingQueries: 1,
            existingQueries: 1,
        });
        await importer().run(org, dimensions);
        await expect(importer().inspect(org)).resolves.toMatchObject({
            missingQueries: 0,
            existingQueries: 2,
        });
        rows = [
            { ...fact('view-2'), current_status: 'updated' },
            fact('view-3'),
        ];
        await expect(importer().inspect(org)).resolves.toMatchObject({
            missingQueries: 1,
            existingQueries: 1,
        });
        await importer().run(org, dimensions);
        expect(
            await sql(
                `SELECT record_id, current_status FROM read_parquet('${filename}', hive_partitioning=false) ORDER BY record_id`,
            ),
        ).toEqual([
            { record_id: 'view-1', current_status: null },
            { record_id: 'view-2', current_status: 'updated' },
            { record_id: 'view-3', current_status: null },
        ]);
        await expect(importer().inspect(org)).resolves.toMatchObject({
            missingQueries: 0,
            existingQueries: 2,
        });
        expect(transport.keys.has(queryHistoryBackfillKey(org))).toBe(false);
    });
});
