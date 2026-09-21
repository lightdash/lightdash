import {
    DimensionType,
    FieldType,
    MetricType,
    type CompiledDimension,
    type CompiledMetric,
    type DataAppVizSchema,
    type ItemsMap,
    type MetricQuery,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    CHART_TYPE_PREVIEW_ROW_LIMIT,
    deriveChartTypePreviewMetricQuery,
    emptyChartTypePreviewMetricQuery,
} from './chartTypePreviewQuery';

const dimension = (name: string): CompiledDimension => ({
    compiledSql: '',
    tablesReferences: [],
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name,
    label: name,
    table: 'customers',
    tableLabel: 'Customers',
    sql: '',
    hidden: false,
});

const metric = (name: string): CompiledMetric => ({
    compiledSql: '',
    tablesReferences: [],
    fieldType: FieldType.METRIC,
    type: MetricType.COUNT,
    name,
    label: name,
    table: 'customers',
    tableLabel: 'Customers',
    sql: '',
    hidden: false,
});

const itemsMap: ItemsMap = {
    customers_channel: dimension('channel'),
    customers_plan: dimension('plan'),
    customers_count: metric('count'),
};

const schema: DataAppVizSchema = {
    fields: [
        { name: 'source', label: 'Source', type: 'dimension', required: true },
        { name: 'value', label: 'Value', type: 'metric', required: true },
    ],
    configOptions: [],
    colorPalette: null,
};

const savedChartQuery: MetricQuery = {
    exploreName: 'customers',
    dimensions: ['customers_channel', 'customers_plan'],
    metrics: ['customers_count'],
    filters: {
        dimensions: {
            id: 'root',
            and: [
                {
                    id: 'rule-1',
                    target: { fieldId: 'customers_channel' },
                    operator: 'equals',
                    values: ['organic'],
                },
            ],
        },
    } as MetricQuery['filters'],
    sorts: [
        { fieldId: 'customers_count', descending: true },
        { fieldId: 'customers_plan', descending: false },
    ],
    limit: 5000,
    tableCalculations: [
        {
            name: 'share',
            displayName: 'Share',
            sql: '${customers_count} / 100',
        },
    ],
};

describe('emptyChartTypePreviewMetricQuery', () => {
    it('caps a fresh preview at the preview row limit', () => {
        expect(emptyChartTypePreviewMetricQuery('customers').limit).toBe(
            CHART_TYPE_PREVIEW_ROW_LIMIT,
        );
    });
});

describe('deriveChartTypePreviewMetricQuery', () => {
    it('takes its columns from the bound inputs', () => {
        const query = deriveChartTypePreviewMetricQuery({
            base: savedChartQuery,
            schema,
            fieldMapping: {
                source: 'customers_channel',
                value: 'customers_count',
            },
            itemsMap,
        });

        expect(query.dimensions).toEqual(['customers_channel']);
        expect(query.metrics).toEqual(['customers_count']);
    });

    it('keeps a chart’s filters even on columns the binding drops', () => {
        const query = deriveChartTypePreviewMetricQuery({
            base: savedChartQuery,
            schema,
            fieldMapping: { source: 'customers_channel' },
            itemsMap,
        });

        expect(query.dimensions).not.toContain('customers_plan');
        expect(query.filters).toEqual(savedChartQuery.filters);
    });

    it('drops sorts whose column the binding no longer selects', () => {
        const query = deriveChartTypePreviewMetricQuery({
            base: savedChartQuery,
            schema,
            fieldMapping: {
                source: 'customers_channel',
                value: 'customers_count',
            },
            itemsMap,
        });

        expect(query.sorts).toEqual([
            { fieldId: 'customers_count', descending: true },
        ]);
    });

    it('selects a bound table calculation as a calculation, not a metric', () => {
        const query = deriveChartTypePreviewMetricQuery({
            base: savedChartQuery,
            schema,
            fieldMapping: {
                source: 'customers_channel',
                value: 'share',
            },
            itemsMap,
        });

        expect(query.metrics).not.toContain('share');
        expect(query.dimensions).not.toContain('share');
        expect(query.tableCalculations.map((calc) => calc.name)).toEqual([
            'share',
        ]);
        // The column the calculation names has to come back with it.
        expect(query.metrics).toContain('customers_count');
    });

    it('drops a table calculation nothing binds', () => {
        const query = deriveChartTypePreviewMetricQuery({
            base: {
                ...savedChartQuery,
                tableCalculations: [
                    {
                        name: 'plan_label',
                        displayName: 'Plan label',
                        sql: '${customers_plan}',
                    },
                ],
            },
            schema,
            fieldMapping: {
                source: 'customers_channel',
                value: 'customers_count',
            },
            itemsMap,
        });

        expect(query.tableCalculations).toEqual([]);
        // The dropped calculation must not drag its dimension back in.
        expect(query.dimensions).toEqual(['customers_channel']);
    });

    it('never asks for more rows than a preview needs', () => {
        const query = deriveChartTypePreviewMetricQuery({
            base: savedChartQuery,
            schema,
            fieldMapping: {},
            itemsMap,
        });

        expect(query.limit).toBe(CHART_TYPE_PREVIEW_ROW_LIMIT);
    });
});
