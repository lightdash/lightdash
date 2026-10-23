import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { WarehouseQueryError, type WarehouseClient } from '@lightdash/common';
import { mapFieldTypeFromTypeId } from '@lightdash/warehouses';
import { warehouseClientMock } from '../../utils/QueryBuilder/MetricQueryBuilder.mock';
import { AsyncQueryService } from './AsyncQueryService';

type Probe = {
    probeDuckdbQueryColumns: (args: {
        sql: string;
        useDescribe: boolean;
        referenceCtes: string[];
        parameters: Record<string, never>;
        warehouseClient: WarehouseClient;
        queryTags: Record<string, never>;
    }) => Promise<unknown>;
};

describe('DuckDB column probes', () => {
    let instance: DuckDBInstance;
    let connection: DuckDBConnection;
    let warehouseClient: WarehouseClient;
    const service = Object.create(AsyncQueryService.prototype) as Probe;
    const probe = (
        sql: string,
        useDescribe: boolean,
        referenceCtes = ['x AS (SELECT * FROM bench)'],
    ) =>
        service.probeDuckdbQueryColumns({
            sql,
            useDescribe,
            referenceCtes,
            parameters: {},
            warehouseClient,
            queryTags: {},
        });

    beforeAll(async () => {
        instance = await DuckDBInstance.create(':memory:');
        connection = await instance.connect();
        await connection.run(`CREATE TABLE bench AS SELECT id, id % 97 AS bucket,
            id::DECIMAL(18, 2) AS value, TIMESTAMP '2026-01-01' AS ts
            FROM range(1000) t(id)`);
        warehouseClient = {
            ...warehouseClientMock,
            streamQuery: async (sql, callback) => {
                const result = await connection.runAndReadAll(sql);
                await callback({
                    fields: Object.fromEntries(
                        result.columnNames().map((name, i) => [
                            name,
                            {
                                type: mapFieldTypeFromTypeId(
                                    result.columnType(i).typeId,
                                ),
                            },
                        ]),
                    ),
                    rows: result.getRowObjectsJS(),
                });
            },
        };
    });

    afterAll(() => {
        connection.closeSync();
        instance.closeSync();
    });

    test.each([
        'SELECT * FROM x',
        'SELECT bucket, sum(value) AS total, avg(value) AS mean, count(*) AS n FROM x GROUP BY bucket',
        'SELECT a.bucket, sum(a.value + b.value) AS total, avg(a.value) AS mean, count(*) AS n FROM x a JOIN x b ON a.bucket = b.bucket GROUP BY a.bucket',
        `SELECT 1.23::DECIMAL(18,2) AS decimal_value,
            TIMESTAMPTZ '2026-01-01 00:00:00+00' AS aware,
            DATE '2026-01-01' AS day, true AS flag, 'text'::VARCHAR AS text,
            [1,2] AS ints, [TIMESTAMP '2026-01-01'] AS timestamps,
            {'n': 1, 'ts': TIMESTAMP '2026-01-01'} AS record`,
        'SELECT * FROM x WHERE false',
        'SELECT * FROM x; -- trailing comment',
        'SELECT 1 AS duplicate, 2 AS duplicate FROM x',
    ])('returns identical columns: %s', async (sql) => {
        expect(await probe(sql, true)).toEqual(await probe(sql, false));
    });

    test.each([
        'SELECT 1 AS duplicate, true AS duplicate',
        'SELECT 1 AS "2", true AS "1"',
    ])('preserves field-key semantics without references: %s', async (sql) => {
        expect(await probe(sql, true, [])).toEqual(await probe(sql, false, []));
    });

    test.each(['SELECT FROM', 'SELECT missing FROM x'])(
        'rejects invalid SQL with the same error shape: %s',
        async (sql) => {
            const errors = await Promise.all(
                [false, true].map(async (mode) => {
                    try {
                        await probe(sql, mode);
                        throw new Error('Expected probe failure');
                    } catch (error) {
                        expect(error).toBeInstanceOf(WarehouseQueryError);
                        return error as WarehouseQueryError;
                    }
                }),
            );
            expect(errors[0].name).toBe(errors[1].name);
            expect(errors[0].statusCode).toBe(errors[1].statusCode);
            expect(errors[0].message.split(':')[0]).toBe(
                errors[1].message.split(':')[0],
            );
        },
    );
});
