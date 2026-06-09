import type { ResultRow } from '../types/results';
import {
    buildPivotRowTotalKey,
    buildWarehouseColumnTotals,
    buildWarehouseRowTotals,
} from './pivotQueryResults';

const cell = (raw: unknown): ResultRow[string] => ({
    value: { raw, formatted: String(raw) },
});

const row = (values: Record<string, unknown>): ResultRow =>
    Object.fromEntries(
        Object.entries(values).map(([key, raw]) => [key, cell(raw)]),
    );

describe('buildWarehouseColumnTotals', () => {
    it('flattens the first row into numeric column totals', () => {
        const rows = [row({ revenue_card: 100, revenue_cash: 50.5 })];
        expect(buildWarehouseColumnTotals(rows)).toEqual({
            revenue_card: 100,
            revenue_cash: 50.5,
        });
    });

    it('coerces numeric strings and drops non-numeric cells', () => {
        const rows = [row({ revenue: '123.4', label: 'Total', missing: null })];
        expect(buildWarehouseColumnTotals(rows)).toEqual({ revenue: 123.4 });
    });

    it('returns an empty map when there are no rows', () => {
        expect(buildWarehouseColumnTotals([])).toEqual({});
    });
});

describe('buildWarehouseRowTotals', () => {
    it('keys each row by its index values and excludes index fields', () => {
        const indexFieldIds = ['order_date'];
        const rows = [
            row({ order_date: '2024-01-01', revenue: 10, count: 2 }),
            row({ order_date: '2024-01-02', revenue: 20, count: 4 }),
        ];

        const result = buildWarehouseRowTotals(rows, indexFieldIds);

        const key1 = buildPivotRowTotalKey([['order_date', '2024-01-01']]);
        const key2 = buildPivotRowTotalKey([['order_date', '2024-01-02']]);
        expect(result[key1]).toEqual({ revenue: 10, count: 2 });
        expect(result[key2]).toEqual({ revenue: 20, count: 4 });
    });

    it('drops non-numeric metric cells', () => {
        const rows = [row({ dim: 'a', revenue: 'not-a-number', count: 3 })];
        const result = buildWarehouseRowTotals(rows, ['dim']);
        const key = buildPivotRowTotalKey([['dim', 'a']]);
        expect(result[key]).toEqual({ count: 3 });
    });
});
