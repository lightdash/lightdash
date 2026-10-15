import { DuckDBInstance } from '@duckdb/node-api';
import { type WarehouseResults } from '@lightdash/common';
import {
    getNumericKindFromType,
    mapFieldTypeFromTypeId,
} from '@lightdash/warehouses';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { LocalProcessSandboxProvider } from '../sandbox/LocalProcessSandboxProvider';
import { DuckdbSandboxRunner } from './DuckdbSandboxRunner';

vi.mock('../../../tracing/tracing', () => ({
    traceSpan: async (_options: unknown, fn: () => Promise<unknown>) => fn(),
}));

const logger = { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() };

/** What the server's DuckDB client wrote for a statement: fields and JSONL bytes. */
const runOnServerClient = async (sql: string) => {
    const instance = await DuckDBInstance.create(':memory:');
    const connection = await instance.connect();
    try {
        const result = await connection.stream(sql);
        const names = result.columnNames();
        const fields: WarehouseResults['fields'] = {};
        for (let i = 0; i < result.columnCount; i += 1) {
            const type = result.columnType(i);
            const numericKind = getNumericKindFromType(type);
            fields[names[i]] = {
                type: mapFieldTypeFromTypeId(type.typeId),
                ...(numericKind ? { numericKind } : {}),
            };
        }
        let lines = '';
        // eslint-disable-next-line no-restricted-syntax
        for await (const rows of result.yieldRowObjectJson()) {
            lines += rows.map((row) => `${JSON.stringify(row)}\n`).join('');
        }
        return { fields, lines };
    } finally {
        connection.closeSync();
        instance.closeSync();
    }
};

const CASES: [string, string][] = [
    [
        'integers of every width',
        `SELECT 1::TINYINT a, 2::SMALLINT b, 3::INTEGER c, 4::BIGINT d, 170141183460469231731687303715884105727::HUGEINT e,
            255::UTINYINT f, 65535::USMALLINT g, 4294967295::UINTEGER h, 18446744073709551615::UBIGINT i, 1::UHUGEINT j,
            (-9223372036854775808)::BIGINT k, 123456789012345678::BIGNUM l`,
    ],
    [
        'decimals',
        `SELECT 2.5::DECIMAL(10,2) a, -0.05::DECIMAL(5,3) b, 123::DECIMAL(38,0) c, 12345678901234567890.123456789::DECIMAL(38,9) d, SUM(x)::DECIMAL(18,3) e FROM (VALUES (1.5), (2.25)) t(x)`,
    ],
    [
        'floats JavaScript formats differently from Python',
        `SELECT * FROM (VALUES
            (1.1::FLOAT, 1.0::DOUBLE), (0.1::FLOAT, 1e21::DOUBLE), (-2.5::FLOAT, 1e-7::DOUBLE),
            (3.4e38::FLOAT, 123456789012345680000::DOUBLE), ('nan'::FLOAT, 'nan'::DOUBLE),
            ('inf'::FLOAT, '-inf'::DOUBLE), (-0.0::FLOAT, -0.0::DOUBLE), (1e-6::FLOAT, 0.000001234::DOUBLE),
            (NULL, 5e-324::DOUBLE), (100::FLOAT, 1.7976931348623157e308::DOUBLE), (0.5::FLOAT, 1e20::DOUBLE)
        ) t(f, d)`,
    ],
    [
        'strings, booleans, uuids, json, enums and bits',
        `SELECT 'é ☃ "quoted" \\ back' || chr(10) || chr(9) || chr(1) || chr(8232) AS s, true AS yes, false AS no,
            '00000000-0000-0000-0000-00000000000a'::UUID u, '{"a": [1, 2]}'::JSON j, '101'::BIT b,
            CAST('b' AS ENUM ('a', 'b')) e, NULL AS n, '' AS empty`,
    ],
    [
        'dates, times and timestamps',
        `SELECT '2024-02-29'::DATE d, '0044-03-15 (BC)'::DATE bc, '12:00:00.0001'::TIME t, '12:00:00'::TIME t2,
            '12:00:00.123+05:30'::TIMETZ tz, '12:00:00.123456789'::TIME_NS tns,
            '2020-01-01 01:02:03.5'::TIMESTAMP ts, '2020-01-01 01:02:03'::TIMESTAMP_S ts_s,
            '2020-01-01 01:02:03.120'::TIMESTAMP_MS ts_ms, '2020-01-01 01:02:03.123456789'::TIMESTAMP_NS ts_ns,
            '2024-01-01 12:00:00.5+00'::TIMESTAMPTZ tstz, '2024-07-01 23:30:00+00'::TIMESTAMPTZ tstz_summer,
            'infinity'::TIMESTAMP ts_inf, '-infinity'::TIMESTAMPTZ tstz_inf`,
    ],
    [
        'intervals and blobs',
        `SELECT INTERVAL '1 year 2 months 3 days 04:05:06.000007' a, INTERVAL '-3 days -1 hour' b,
            INTERVAL '-1 year 1 month 25 hours -7 microseconds' c, INTERVAL '0 seconds' d,
            '\\x00ab''"\\xFF'::BLOB e, ''::BLOB f`,
    ],
    [
        'lists, arrays, structs, maps and unions',
        `SELECT [1, 2] l, [10::BIGINT, NULL] lb, ['a', NULL] ls, [[1.5::DECIMAL(4,2)]] ll, [1, 2]::INTEGER[2] arr,
            {'x': 1, 'y': 'a', '1': 2, 'big': 9::BIGINT} st, {'d': DATE '2024-01-01', 'n': {'i': INTERVAL 1 DAY}} nested,
            MAP([1, 2], ['a', 'b']) m, MAP(['k'], [[3::HUGEINT]]) mb, union_value(k := 1)::UNION(k INTEGER, s VARCHAR) u,
            union_value(s := 'x')::UNION(k INTEGER, s VARCHAR) u2, NULL::STRUCT(a BIGINT) nst, NULL::INTEGER[] nl,
            NULL::MAP(INTEGER, INTEGER) nm, NULL::UNION(k INTEGER) nu, [{'a': 1.5::DOUBLE}] lst`,
    ],
    [
        'column names JavaScript orders first or overwrites',
        `SELECT 1 AS "b", 2 AS "10", 3 AS "a", 4 AS "2", 5 AS "a", 6 AS "01", 10 AS "a:1", 7 AS "4294967295", 8 AS "4294967294"`,
    ],
    [
        'many rows across fetch batches',
        `SELECT range AS id, range::BIGINT * 3 AS tripled, range / 7 AS ratio, 'row ' || range AS label FROM range(5000) ORDER BY id DESC`,
    ],
    ['no rows', `SELECT 1::BIGINT AS id, 'x' AS label WHERE false`],
];

describe('DuckDB sandbox runner parity with the server client', () => {
    const runner = new DuckdbSandboxRunner({
        lightdashConfig: lightdashConfigMock,
        logger,
        provider: new LocalProcessSandboxProvider(),
        runnerSource: null,
    });

    it.each(CASES)(
        'writes the same fields and bytes for %s',
        async (_label, sql) => {
            const expected = await runOnServerClient(sql);

            const actual = await runner.withSession(
                {
                    queryUuid: 'query-uuid',
                    projectUuid: 'project-uuid',
                    commandTimeoutMs: 30_000,
                    referenceWaitMs: 0,
                    inputs: [],
                },
                async (session) => ({
                    probed: await session.probe(sql),
                    ran: await session.run(sql, { limit: null }),
                }),
            );

            expect(actual.ran.resultBytes.toString('utf8')).toBe(
                expected.lines,
            );
            expect(actual.ran.fields).toEqual(expected.fields);
            expect(actual.probed.fields).toEqual(expected.fields);
            expect(actual.ran.rowCount).toBe(
                expected.lines.split('\n').filter(Boolean).length,
            );
        },
    );
});
