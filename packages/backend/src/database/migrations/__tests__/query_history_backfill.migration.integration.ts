import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { down, up } from '../20261103100000_index_query_history_backfill';

const indexName = 'query_history_org_created_at_query_uuid_idx';
type IndexState = {
    oid: string;
    valid: boolean;
    columns: string[];
};
type PlanNode = {
    'Node Type': string;
    'Index Name'?: string;
    'Index Cond'?: string;
    Plans?: PlanNode[];
};

let migrated: MigratedDatabase;
let organizationUuid: string;

const indexState = async (): Promise<IndexState | null> => {
    const { rows } = await migrated.database.raw<{ rows: IndexState[] }>(
        `SELECT i.indexrelid::text AS oid, i.indisvalid AS valid,
                array_agg(a.attname::text ORDER BY k.position) AS columns
         FROM pg_index i
         CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, position)
         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
         WHERE i.indexrelid = to_regclass(?)
           AND i.indrelid = 'query_history'::regclass
         GROUP BY i.indexrelid, i.indisvalid`,
        [indexName],
    );
    return rows[0] ?? null;
};

const expectValidIndex = async () => {
    expect(await indexState()).toMatchObject({
        valid: true,
        columns: ['organization_uuid', 'created_at', 'query_uuid'],
    });
};

beforeAll(async () => {
    migrated = await createMigratedDatabase(undefined, { min: 0, max: 1 });
    const organizations = await migrated
        .database('organizations')
        .insert([
            { organization_name: 'Backfill target' },
            { organization_name: 'Other retained history' },
        ])
        .returning('organization_uuid');
    organizationUuid = organizations[0].organization_uuid;
    await migrated.database.raw(
        `INSERT INTO query_history
            (organization_uuid, created_at, context, compiled_sql,
             metric_query, fields, request_parameters, status, cache_key)
         SELECT CASE WHEN n % 100 = 0 THEN ?::uuid ELSE ?::uuid END,
                timestamp '2026-01-01' + (n / 1000) * interval '1 microsecond',
                'explore', 'SELECT 1', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
                CASE WHEN n % 200 = 0 THEN 'error' ELSE 'ready' END, n::text
         FROM generate_series(1, 200000) AS n`,
        [organizationUuid, organizations[1].organization_uuid],
    );
    await migrated.database.raw('VACUUM (ANALYZE) query_history');
});

afterAll(async () => {
    await migrated?.destroy();
});

test('creates a valid pagination index and preserves it on repeated up', async () => {
    await expectValidIndex();
    const original = await indexState();
    await up(migrated.database);
    await up(migrated.database);
    expect(await indexState()).toEqual(original);
});

test('reverses and reapplies the index without changing retained rows', async () => {
    const before = await migrated.database('query_history').count('* as count');
    await down(migrated.database);
    expect(await indexState()).toBeNull();
    await up(migrated.database);
    await expectValidIndex();
    expect(
        await migrated.database('query_history').count('* as count'),
    ).toEqual(before);
});

test('recovers an invalid index left by a failed concurrent build', async () => {
    await down(migrated.database);
    await expect(
        migrated.database.raw(
            `CREATE UNIQUE INDEX CONCURRENTLY ${indexName}
             ON query_history (organization_uuid)`,
        ),
    ).rejects.toMatchObject({ code: '23505' });
    expect(await indexState()).toMatchObject({ valid: false });
    await up(migrated.database);
    await expectValidIndex();
});

test('supports ordered organization-scoped keyset scans without sorting', async () => {
    const flatten = (node: PlanNode): PlanNode[] => [
        node,
        ...(node.Plans ?? []).flatMap(flatten),
    ];
    const cursors = [
        null,
        {
            createdAt: '2026-01-01T00:00:00.000100Z',
            queryUuid: '00000000-0000-0000-0000-000000000000',
        },
    ];
    for (const cursor of cursors) {
        const query = migrated
            .database('query_history as q')
            .select('q.query_uuid', 'q.created_at')
            .where('q.organization_uuid', organizationUuid)
            .where('q.created_at', '<', '2026-02-01T00:00:00Z')
            .orderBy('q.created_at')
            .orderBy('q.query_uuid')
            .limit(1000);
        if (cursor)
            query.whereRaw('(??, ??) > (?, ?)', [
                'q.created_at',
                'q.query_uuid',
                cursor.createdAt,
                cursor.queryUuid,
            ]);
        const { sql, bindings } = query.toSQL();
        // eslint-disable-next-line no-await-in-loop
        const { rows } = await migrated.database.raw<{
            rows: { 'QUERY PLAN': { Plan: PlanNode }[] }[];
        }>(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`, bindings);
        const nodes = flatten(rows[0]['QUERY PLAN'][0].Plan);
        const scan = nodes.find((node) => node['Index Name'] === indexName);
        expect(scan).toBeDefined();
        expect(scan?.['Index Cond']).toContain('organization_uuid');
        expect(scan?.['Index Cond']).toContain('created_at');
        if (cursor) expect(scan?.['Index Cond']).toContain('query_uuid');
        expect(nodes.map((node) => node['Node Type'])).not.toContain('Sort');
        expect(nodes.map((node) => node['Node Type'])).not.toContain(
            'Incremental Sort',
        );
    }
});
