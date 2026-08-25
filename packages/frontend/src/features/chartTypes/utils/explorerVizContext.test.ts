import {
    DimensionType,
    FieldType,
    MetricType,
    type DataAppVizSchema,
    type ItemsMap,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { buildExplorerVizContext } from './explorerVizContext';

const itemsMap = {
    orders_status: {
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
        name: 'status',
        label: 'Status',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '${TABLE}.status',
        hidden: false,
    },
    orders_region: {
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
        name: 'region',
        label: 'Region',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '${TABLE}.region',
        hidden: false,
    },
    orders_count: {
        fieldType: FieldType.METRIC,
        type: MetricType.COUNT,
        name: 'count',
        label: 'Count',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '${TABLE}.id',
        hidden: false,
    },
} satisfies ItemsMap;

const schema: DataAppVizSchema = {
    fields: [
        {
            name: 'category',
            label: 'Category',
            type: 'dimension',
            required: true,
        },
        { name: 'value', label: 'Value', type: 'metric', required: true },
    ],
    configOptions: [
        {
            type: 'boolean',
            name: 'showLegend',
            label: 'Show legend',
            default: true,
        },
    ],
    colorPalette: null,
};

const rows = [{ orders_status: { value: { raw: 'new', formatted: 'New' } } }];

const build = (
    overrides: Partial<Parameters<typeof buildExplorerVizContext>[0]> = {},
) =>
    buildExplorerVizContext({
        schema,
        itemsMap,
        persistedFieldMapping: null,
        rows,
        pivotDetails: null,
        colorPalette: ['#111', '#222'],
        optionValues: {},
        ...overrides,
    });

describe('buildExplorerVizContext', () => {
    it('binds the schema to the result columns when the chart has no mapping', () => {
        expect(build().fieldMapping).toEqual({
            category: 'orders_status',
            value: 'orders_count',
        });
    });

    it('keeps the chart binding it already has when it uses this type', () => {
        const context = build({
            persistedFieldMapping: { category: 'orders_region' },
        });

        expect(context.fieldMapping.category).toBe('orders_region');
    });

    it('passes the Explorer rows, pivot and palette through untouched', () => {
        const pivotDetails = {
            totalColumnCount: 2,
            valuesColumns: [],
            indexColumn: [],
            groupByColumns: [],
            sortBy: [],
        } as unknown as NonNullable<
            Parameters<typeof buildExplorerVizContext>[0]['pivotDetails']
        >;
        const context = build({ pivotDetails });

        expect(context.rows).toBe(rows);
        expect(context.pivotDetails).toBe(pivotDetails);
        expect(context.colorPalette).toEqual(['#111', '#222']);
        expect(context.underlyingData).toEqual({ enabled: false });
        expect(context.drillDown).toEqual({ enabled: false });
    });

    it('resolves every declared option, defaults filling what was not edited', () => {
        expect(build().options).toEqual({ showLegend: true });
        expect(build({ optionValues: { showLegend: false } }).options).toEqual({
            showLegend: false,
        });
    });
});
