import { DimensionType, type ResultColumns } from '@lightdash/common';
import {
    getDuckdbPreAggregateSqlTable,
    type PreAggregateDuckdbLocator,
} from './getDuckdbPreAggregateSqlTable';

const locator: PreAggregateDuckdbLocator = {
    storage: 's3',
    format: 'jsonl',
    key: 'abc123.jsonl',
    uri: 's3://bucket/abc123.jsonl',
};

describe('getDuckdbPreAggregateSqlTable', () => {
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
