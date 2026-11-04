import { DimensionType, WarehouseQueryError } from '@lightdash/common';
import { DuckdbWarehouseClient } from '@lightdash/warehouses';
import { AsyncQueryService } from './AsyncQueryService';

type Probe = {
    probeDuckdbQueryColumns: (args: {
        sql: string;
        referenceCtes: string[];
        parameters: Record<string, never>;
        warehouseClient: DuckdbWarehouseClient;
        queryTags: Record<string, string>;
    }) => Promise<unknown>;
};

describe('DuckDB column probes', () => {
    const warehouseClient = new DuckdbWarehouseClient();
    const service = Object.create(AsyncQueryService.prototype) as Probe;
    const probe = (sql: string) =>
        service.probeDuckdbQueryColumns({
            sql,
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

    test.each<[string, string[]]>([
        ['SELECT id, bucket FROM x', ['id', 'bucket']],
        [
            'WITH a AS (SELECT bucket, sum(value) AS total FROM x GROUP BY bucket) SELECT * FROM a',
            ['bucket', 'total'],
        ],
        ['SELECT id FROM x UNION ALL SELECT bucket FROM x', ['id']],
        [
            'SELECT id, row_number() OVER (PARTITION BY bucket ORDER BY id) AS rn FROM x QUALIFY rn = 1',
            ['id', 'rn'],
        ],
        [
            'SELECT a.bucket, count(*) AS n FROM x a JOIN x b ON a.bucket = b.bucket GROUP BY 1',
            ['bucket', 'n'],
        ],
        ['SELECT id FROM x; -- trailing comment', ['id']],
        [
            'SELECT 1 AS duplicate, true AS duplicate FROM x',
            ['duplicate', 'duplicate_1'],
        ],
    ])('discovers columns: %s', async (sql, names) => {
        expect(await probe(sql)).toEqual(
            names.map((name) => expect.objectContaining({ name })),
        );
    });

    test('maps DuckDB scalar and nested types', async () => {
        const typedExpressions: [string, DimensionType][] = [
            ['1::TINYINT', DimensionType.NUMBER],
            ['1::UBIGINT', DimensionType.NUMBER],
            ['1::HUGEINT', DimensionType.NUMBER],
            ['1::FLOAT', DimensionType.NUMBER],
            ['1::DOUBLE', DimensionType.NUMBER],
            ['1.5::DECIMAL(38, 4)', DimensionType.NUMBER],
            ["DATE '2026-01-01'", DimensionType.DATE],
            ["TIME '01:00'", DimensionType.TIMESTAMP],
            ["'01:00:00+00'::TIMETZ", DimensionType.TIMESTAMP],
            ["TIMESTAMPTZ '2026-01-01 00:00:00+00'", DimensionType.TIMESTAMP],
            ["'2026-01-01'::TIMESTAMP_S", DimensionType.TIMESTAMP],
            ["'2026-01-01'::TIMESTAMP_MS", DimensionType.TIMESTAMP],
            ["'2026-01-01'::TIMESTAMP_NS", DimensionType.TIMESTAMP],
            ['INTERVAL 1 DAY', DimensionType.STRING],
            ['true', DimensionType.BOOLEAN],
            ["'a'::VARCHAR", DimensionType.STRING],
            ['[1, 2]', DimensionType.STRING],
            ['[1, 2]::INTEGER[2]', DimensionType.STRING],
            ["{'n': 1}", DimensionType.STRING],
            ['uuid()', DimensionType.STRING],
        ];
        const sql = `SELECT ${typedExpressions.map(([expression], i) => `${expression} AS c${i}`).join(', ')} FROM x`;
        expect(await probe(sql)).toEqual(
            typedExpressions.map(([, type], i) => ({ name: `c${i}`, type })),
        );
    });

    test('keeps typed columns for zero-row results', async () => {
        expect(await probe('SELECT id, value, ts FROM x WHERE false')).toEqual([
            { name: 'id', type: DimensionType.NUMBER },
            { name: 'value', type: DimensionType.NUMBER },
            { name: 'ts', type: DimensionType.TIMESTAMP },
        ]);
    });

    test('binds without evaluating runtime casts', async () => {
        expect(
            await probe("SELECT CAST('invalid' AS INTEGER) AS n FROM x"),
        ).toEqual([{ name: 'n', type: DimensionType.NUMBER }]);
    });

    test.each([
        'SELECT FROM',
        'SELECT missing FROM x',
        'SELECT 1 AS a; SELECT 2 AS b',
    ])('rejects invalid SQL: %s', async (sql) => {
        await expect(probe(sql)).rejects.toBeInstanceOf(WarehouseQueryError);
    });
});
