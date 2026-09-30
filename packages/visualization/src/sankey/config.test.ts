import {
    DimensionType,
    FieldType,
    MetricType,
    type Dimension,
    type ItemsMap,
    type Metric,
    type ResultRow,
} from '@lightdash/common';
import { describe, expect, test } from 'vitest';
import {
    getSankeyFields,
    resolveSankeyChartConfig,
    resolveSankeySourceFieldId,
    resolveSankeyTargetFieldId,
} from './config';

const dimension = (name: string): Dimension => ({
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name,
    label: name,
    table: 'orders',
    tableLabel: 'Orders',
    sql: `\${TABLE}.${name}`,
    hidden: false,
});

const metric = (name: string): Metric => ({
    fieldType: FieldType.METRIC,
    type: MetricType.SUM,
    name,
    label: name,
    table: 'orders',
    tableLabel: 'Orders',
    sql: `\${TABLE}.${name}`,
    hidden: false,
});

const SANKEY_ITEMS_MAP: ItemsMap = {
    orders_from: dimension('from'),
    orders_to: dimension('to'),
    orders_amount: metric('amount'),
};

const cell = (formatted: string, raw: unknown = formatted) => ({
    value: { raw, formatted },
});

const sankeyRow = (
    source: string,
    target: string,
    amount: number,
): ResultRow => ({
    orders_from: cell(source),
    orders_to: cell(target),
    orders_amount: cell(String(amount), amount),
});

const SANKEY_ROWS: ResultRow[] = [
    sankeyRow('A', 'B', 10),
    sankeyRow('A', 'C', 5),
    sankeyRow('B', 'D', 7),
];

describe('getSankeyFields', () => {
    test('splits dimensions from numeric fields', () => {
        const fields = getSankeyFields(SANKEY_ITEMS_MAP);
        expect(Object.keys(fields.dimensions)).toEqual([
            'orders_from',
            'orders_to',
        ]);
        expect(Object.keys(fields.numericFields)).toEqual(['orders_amount']);
    });

    test('is empty without items', () => {
        expect(getSankeyFields(undefined)).toEqual({
            dimensions: {},
            numericFields: {},
        });
    });
});

describe('resolveSankeySourceFieldId', () => {
    const dimensionIds = ['orders_from', 'orders_to'];

    test('keeps a valid field', () => {
        expect(
            resolveSankeySourceFieldId({
                sourceFieldId: 'orders_to',
                dimensionIds,
                isLoading: false,
            }),
        ).toBe('orders_to');
    });

    test('falls back to the first dimension', () => {
        expect(
            resolveSankeySourceFieldId({
                sourceFieldId: 'gone',
                dimensionIds,
                isLoading: false,
            }),
        ).toBe('orders_from');
    });

    test('follows a table calculation rename', () => {
        expect(
            resolveSankeySourceFieldId({
                sourceFieldId: 'old_calc',
                dimensionIds,
                isLoading: false,
                tableCalculationsMetadata: [
                    { name: 'new_calc', oldName: 'old_calc' },
                ],
            }),
        ).toBe('new_calc');
    });

    test('changes nothing while loading or with one dimension', () => {
        expect(
            resolveSankeySourceFieldId({
                sourceFieldId: null,
                dimensionIds,
                isLoading: true,
            }),
        ).toBeNull();
        expect(
            resolveSankeySourceFieldId({
                sourceFieldId: null,
                dimensionIds: ['orders_from'],
                isLoading: false,
            }),
        ).toBeNull();
    });
});

describe('resolveSankeyTargetFieldId', () => {
    test('picks a dimension different from the source', () => {
        expect(
            resolveSankeyTargetFieldId({
                targetFieldId: null,
                sourceFieldId: 'orders_to',
                dimensionIds: ['orders_from', 'orders_to'],
                isLoading: false,
            }),
        ).toBe('orders_from');
    });
});

describe('resolveSankeyChartConfig', () => {
    test('fills in the fields and defaults of an empty config', () => {
        const { validConfig, data } = resolveSankeyChartConfig({
            chartConfig: undefined,
            resultsData: { rows: SANKEY_ROWS },
            itemsMap: SANKEY_ITEMS_MAP,
        });

        expect(validConfig).toEqual({
            sourceFieldId: 'orders_from',
            targetFieldId: 'orders_to',
            metricFieldId: 'orders_amount',
            nodeAlign: 'justify',
            orient: 'horizontal',
            nodeLayout: 'multi-step',
        });
        expect(data.nodes.map((n) => n.name).sort()).toEqual([
            'A',
            'B',
            'C',
            'D',
        ]);
        expect(data.links).toHaveLength(3);
        expect(data.maxDepth).toBe(2);
        expect(data.hasCycle).toBe(false);
    });

    test('keeps a saved config and lays it out as asked', () => {
        const { validConfig, data } = resolveSankeyChartConfig({
            chartConfig: {
                sourceFieldId: 'orders_to',
                targetFieldId: 'orders_from',
                metricFieldId: 'orders_amount',
                nodeAlign: 'left',
                orient: 'vertical',
                nodeLayout: 'direct',
            },
            resultsData: { rows: SANKEY_ROWS },
            itemsMap: SANKEY_ITEMS_MAP,
        });

        expect(validConfig.sourceFieldId).toBe('orders_to');
        expect(validConfig.targetFieldId).toBe('orders_from');
        expect(validConfig.nodeAlign).toBe('left');
        expect(validConfig.orient).toBe('vertical');
        expect(data.maxDepth).toBe(1);
        expect(data.nodes.every((n) => /^(source|target):/.test(n.name))).toBe(
            true,
        );
    });

    test('has no data before the results arrive', () => {
        const { validConfig, data } = resolveSankeyChartConfig({
            chartConfig: undefined,
            resultsData: undefined,
            itemsMap: SANKEY_ITEMS_MAP,
        });

        expect(validConfig.sourceFieldId).toBeUndefined();
        expect(data.links).toEqual([]);
    });
});
