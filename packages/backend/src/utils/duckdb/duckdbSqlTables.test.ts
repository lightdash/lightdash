import { DimensionType, type ResultColumns } from '@lightdash/common';
import {
    getDuckdbPreAggregateSqlTable,
    getJsonlReferenceSelect,
    getPreAggregateDuckdbLocator,
    resultColumnToDuckdbType,
    type PreAggregateDuckdbLocator,
} from './duckdbSqlTables';

describe('resultColumnToDuckdbType', () => {
    test('NUMBER without a kind stays DOUBLE', () => {
        expect(resultColumnToDuckdbType({ type: DimensionType.NUMBER })).toBe(
            'DOUBLE',
        );
    });

    test('NUMBER binds by its numeric kind', () => {
        expect(
            resultColumnToDuckdbType({
                type: DimensionType.NUMBER,
                numericKind: { kind: 'integer' },
            }),
        ).toBe('HUGEINT');
        expect(
            resultColumnToDuckdbType({
                type: DimensionType.NUMBER,
                numericKind: { kind: 'decimal', scale: 4 },
            }),
        ).toBe('DECIMAL(38,4)');
        expect(
            resultColumnToDuckdbType({
                type: DimensionType.NUMBER,
                numericKind: { kind: 'float' },
            }),
        ).toBe('DOUBLE');
    });

    test('a numeric kind on a non-NUMBER column is ignored', () => {
        expect(
            resultColumnToDuckdbType({
                type: DimensionType.STRING,
                numericKind: { kind: 'integer' },
            }),
        ).toBe('VARCHAR');
    });
});

describe('getJsonlReferenceSelect', () => {
    test('reads every column as text and casts it in the select list', () => {
        const columns: ResultColumns = {
            orders_total: {
                reference: 'orders.total',
                type: DimensionType.NUMBER,
                numericKind: { kind: 'decimal', scale: 2 },
            },
            orders_name: {
                reference: 'orders.name',
                type: DimensionType.STRING,
            },
            orders_is_paid: {
                reference: 'orders.is_paid',
                type: DimensionType.BOOLEAN,
            },
        };

        expect(
            getJsonlReferenceSelect('s3://bucket/abc123.jsonl', columns),
        ).toBe(
            `SELECT COALESCE(TRY_CAST("orders_total" AS DECIMAL(38,2)), CASE WHEN "orders_total" IS NULL THEN NULL ELSE error('Referenced column orders_total holds a value that cannot be read as number: ' || left("orders_total", 100)) END) AS "orders_total", "orders_name", COALESCE(TRY_CAST("orders_is_paid" AS BOOLEAN), CASE WHEN "orders_is_paid" IS NULL THEN NULL ELSE error('Referenced column orders_is_paid holds a value that cannot be read as boolean: ' || left("orders_is_paid", 100)) END) AS "orders_is_paid" FROM read_json('s3://bucket/abc123.jsonl', columns={"orders_total": 'VARCHAR', "orders_name": 'VARCHAR', "orders_is_paid": 'VARCHAR'}, format='newline_delimited')`,
        );
    });

    test('reads a timestamp as an instant unless it is naive', () => {
        const select = getJsonlReferenceSelect('s3://bucket/abc123.jsonl', {
            created_at: {
                reference: 'created_at',
                type: DimensionType.TIMESTAMP,
            },
        });
        expect(select).toContain(
            `CASE WHEN regexp_matches("created_at", '^\\d{4}-\\d{2}-\\d{2}([T ]\\d{2}:\\d{2}(:\\d{2}(\\.\\d+)?)?)?$') THEN TRY_CAST("created_at" AS TIMESTAMP) ELSE timezone('UTC', TRY_CAST("created_at" AS TIMESTAMPTZ)) END`,
        );
    });

    test('falls back to read_json_auto when columns are empty or null', () => {
        expect(getJsonlReferenceSelect('s3://bucket/abc123.jsonl', {})).toBe(
            `SELECT * FROM read_json_auto('s3://bucket/abc123.jsonl')`,
        );
        expect(getJsonlReferenceSelect('s3://bucket/abc123.jsonl', null)).toBe(
            `SELECT * FROM read_json_auto('s3://bucket/abc123.jsonl')`,
        );
    });

    test('escapes the uri and the column name inside the refusal message', () => {
        expect(
            getJsonlReferenceSelect(`s3://bucket/o'hara.jsonl`, {
                [`orders"status'value`]: {
                    reference: 'orders.status',
                    type: DimensionType.BOOLEAN,
                },
            }),
        ).toBe(
            `SELECT COALESCE(TRY_CAST("orders""status'value" AS BOOLEAN), CASE WHEN "orders""status'value" IS NULL THEN NULL ELSE error('Referenced column orders"status''value holds a value that cannot be read as boolean: ' || left("orders""status'value", 100)) END) AS "orders""status'value" FROM read_json('s3://bucket/o''hara.jsonl', columns={"orders""status'value": 'VARCHAR'}, format='newline_delimited')`,
        );
    });
});

const locator: PreAggregateDuckdbLocator = {
    storage: 's3',
    format: 'jsonl',
    uri: 's3://bucket/abc123.jsonl',
};

describe('getDuckdbPreAggregateSqlTable', () => {
    test('builds a locator directly from a persisted S3 URI', () => {
        expect(
            getPreAggregateDuckdbLocator({
                uri: 's3://bucket/abc123.jsonl',
                format: 'jsonl',
            }),
        ).toEqual(locator);
    });

    test('generates read_json with typed schema when columns are provided', () => {
        const columns: ResultColumns = {
            orders_total: {
                reference: 'orders.total',
                type: DimensionType.NUMBER,
            },
            orders_created_date: {
                reference: 'orders.created_date',
                type: DimensionType.DATE,
            },
            orders_created_at: {
                reference: 'orders.created_at',
                type: DimensionType.TIMESTAMP,
            },
            orders_is_paid: {
                reference: 'orders.is_paid',
                type: DimensionType.BOOLEAN,
            },
        };

        expect(getDuckdbPreAggregateSqlTable(locator, columns)).toBe(
            `read_json('s3://bucket/abc123.jsonl', columns={"orders_total": 'DOUBLE', "orders_created_date": 'DATE', "orders_created_at": 'TIMESTAMP', "orders_is_paid": 'BOOLEAN'}, format='newline_delimited')`,
        );
    });

    test('falls back to read_json_auto when columns are empty or null', () => {
        expect(getDuckdbPreAggregateSqlTable(locator, {})).toBe(
            `read_json_auto('s3://bucket/abc123.jsonl')`,
        );
        expect(getDuckdbPreAggregateSqlTable(locator, null)).toBe(
            `read_json_auto('s3://bucket/abc123.jsonl')`,
        );
    });

    test('escapes uri and safely quotes/escapes column keys', () => {
        const columns: ResultColumns = {
            [`orders"status'value`]: {
                reference: `orders.status`,
                type: DimensionType.STRING,
            },
        };

        expect(
            getDuckdbPreAggregateSqlTable(
                {
                    ...locator,
                    uri: `s3://bucket/o'hara.jsonl`,
                },
                columns,
            ),
        ).toBe(
            `read_json('s3://bucket/o''hara.jsonl', columns={"orders""status'value": 'VARCHAR'}, format='newline_delimited')`,
        );
    });
});
