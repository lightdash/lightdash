import { type ResultRow } from '../types/results';
import { type PivotValuesColumn } from '../visualizations/types';
import {
    buildLabelValueMap,
    buildLabelValueMapFromPivotValues,
    getLabelForValue,
    mergeLabelValueMaps,
} from './labelValueMap';

const row = (cells: Record<string, unknown>): ResultRow =>
    Object.fromEntries(
        Object.entries(cells).map(([key, raw]) => [
            key,
            { value: { raw, formatted: String(raw) } },
        ]),
    );

describe('buildLabelValueMap', () => {
    it('returns an empty map when there is no labelDimensionMap', () => {
        expect(buildLabelValueMap([], undefined)).toEqual({});
        expect(buildLabelValueMap([], {})).toEqual({});
    });

    it('maps each raw id to its label from the companion column', () => {
        const rows = [
            row({ orders_customer_id: 1, customers_name: 'Alice' }),
            row({ orders_customer_id: 2, customers_name: 'Bob' }),
        ];
        expect(
            buildLabelValueMap(rows, {
                orders_customer_id: 'customers_name',
            }),
        ).toEqual({
            orders_customer_id: { '1': 'Alice', '2': 'Bob' },
        });
    });

    it('keeps the first label when a raw id maps to several labels', () => {
        const rows = [
            row({ orders_customer_id: 1, customers_name: 'Alice' }),
            row({ orders_customer_id: 1, customers_name: 'Alice (dupe)' }),
        ];
        expect(
            buildLabelValueMap(rows, {
                orders_customer_id: 'customers_name',
            }),
        ).toEqual({
            orders_customer_id: { '1': 'Alice' },
        });
    });

    it('skips rows whose id value is null or undefined', () => {
        const rows = [
            row({ orders_customer_id: null, customers_name: 'Nobody' }),
            row({ orders_customer_id: 3, customers_name: 'Carol' }),
        ];
        expect(
            buildLabelValueMap(rows, {
                orders_customer_id: 'customers_name',
            }),
        ).toEqual({
            orders_customer_id: { '3': 'Carol' },
        });
    });
});

const valuesColumn = (
    pivotValues: PivotValuesColumn['pivotValues'],
): PivotValuesColumn => ({
    referenceField: 'orders_model_total_amount',
    pivotColumnName: 'orders_model_total_amount_sum',
    aggregation: 'sum' as PivotValuesColumn['aggregation'],
    pivotValues,
});

describe('buildLabelValueMapFromPivotValues', () => {
    it('returns an empty map when there are no columns', () => {
        expect(buildLabelValueMapFromPivotValues(undefined)).toEqual({});
        expect(buildLabelValueMapFromPivotValues([])).toEqual({});
    });

    it('maps each pivot value to its companion label', () => {
        expect(
            buildLabelValueMapFromPivotValues([
                valuesColumn([
                    {
                        referenceField: 'orders_region_cd',
                        value: 1,
                        formatted: '1',
                        label: 'North',
                    },
                ]),
                valuesColumn([
                    {
                        referenceField: 'orders_region_cd',
                        value: 2,
                        formatted: '2',
                        label: 'South',
                    },
                ]),
            ]),
        ).toEqual({
            orders_region_cd: { '1': 'North', '2': 'South' },
        });
    });

    it('skips pivot values that have no label', () => {
        expect(
            buildLabelValueMapFromPivotValues([
                valuesColumn([
                    { referenceField: 'orders_region_cd', value: 1 },
                ]),
            ]),
        ).toEqual({});
    });
});

describe('mergeLabelValueMaps', () => {
    it('merges maps across fields, later maps winning on key conflicts', () => {
        expect(
            mergeLabelValueMaps(
                { orders_region_cd: { '1': 'North' } },
                {
                    orders_region_cd: { '1': 'North (dupe)', '2': 'South' },
                    orders_other: { a: 'A' },
                },
            ),
        ).toEqual({
            orders_region_cd: { '1': 'North (dupe)', '2': 'South' },
            orders_other: { a: 'A' },
        });
    });
});

describe('getLabelForValue', () => {
    const labelValueMap = {
        orders_customer_id: { '1': 'Alice' },
    };

    it('returns the label for a known field and value', () => {
        expect(
            getLabelForValue(labelValueMap, 'orders_customer_id', 1),
        ).toEqual('Alice');
    });

    it('returns undefined for unknown field, value, or nullish input', () => {
        expect(
            getLabelForValue(labelValueMap, 'orders_customer_id', 9),
        ).toBeUndefined();
        expect(getLabelForValue(labelValueMap, 'other', 1)).toBeUndefined();
        expect(
            getLabelForValue(labelValueMap, 'orders_customer_id', null),
        ).toBeUndefined();
        expect(
            getLabelForValue(undefined, 'orders_customer_id', 1),
        ).toBeUndefined();
    });
});
