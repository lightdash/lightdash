import { WarehouseQueryError } from '@lightdash/common';
import { DuckdbWarehouseClient } from '@lightdash/warehouses';
import { AsyncQueryService } from './AsyncQueryService';

type Probe = {
    probeDuckdbQueryColumns: (args: {
        sql: string;
        useDescribe: boolean;
        referenceCtes: string[];
        parameters: Record<string, never>;
        warehouseClient: DuckdbWarehouseClient;
        queryTags: Record<string, string>;
    }) => Promise<unknown>;
};

describe('DuckDB column probes', () => {
    const warehouseClient = new DuckdbWarehouseClient();
    const service = Object.create(AsyncQueryService.prototype) as Probe;
    const probe = (sql: string, useDescribe: boolean) =>
        service.probeDuckdbQueryColumns({
            sql,
            useDescribe,
            referenceCtes: [
                `x AS (SELECT range AS id, range % 7 AS bucket,
                    range::DECIMAL(18, 2) AS value, TIMESTAMP '2026-01-01' AS ts
                    FROM range(100))`,
            ],
            parameters: {},
            warehouseClient,
            queryTags: { query_uuid: 'probe' },
        });

    afterAll(() => warehouseClient.close());

    test.each([
        'SELECT * FROM x',
        'WITH a AS (SELECT bucket, sum(value) AS total FROM x GROUP BY bucket) SELECT * FROM a',
        'SELECT id FROM x UNION ALL SELECT bucket FROM x',
        'SELECT id, row_number() OVER (PARTITION BY bucket ORDER BY id) AS rn FROM x QUALIFY rn = 1',
        'SELECT a.bucket, count(*) AS n FROM x a JOIN x b ON a.bucket = b.bucket GROUP BY 1',
        'SELECT * FROM x; -- trailing comment',
        'SELECT 1 AS duplicate, true AS duplicate FROM x',
        `SELECT 1::TINYINT AS i1, 1::UBIGINT AS i2, 1::HUGEINT AS i3,
            1::FLOAT AS f, 1::DOUBLE AS d, 1.5::DECIMAL(38, 4) AS dec,
            DATE '2026-01-01' AS day, TIME '01:00' AS t, '01:00:00+00'::TIMETZ AS ttz,
            TIMESTAMPTZ '2026-01-01 00:00:00+00' AS aware,
            '2026-01-01'::TIMESTAMP_S AS ts_s, '2026-01-01'::TIMESTAMP_MS AS ts_ms,
            '2026-01-01'::TIMESTAMP_NS AS ts_ns, INTERVAL 1 DAY AS span,
            true AS flag, 'a'::VARCHAR AS text, [1, 2] AS ints, [1, 2]::INTEGER[2] AS arr,
            {'n': 1} AS record, uuid() AS id FROM x`,
    ])('returns identical columns: %s', async (sql) => {
        expect(await probe(sql, true)).toEqual(await probe(sql, false));
    });

    test.each([
        'SELECT FROM',
        'SELECT missing FROM x',
        'SELECT 1 AS a; SELECT 2 AS b',
    ])('rejects invalid SQL the same way: %s', async (sql) => {
        const [limitError, describeError] = await Promise.all(
            [false, true].map((useDescribe) =>
                probe(sql, useDescribe).then(
                    () => null,
                    (e: unknown) => e,
                ),
            ),
        );
        expect(limitError).toBeInstanceOf(WarehouseQueryError);
        expect(describeError).toBeInstanceOf(WarehouseQueryError);
    });
});
