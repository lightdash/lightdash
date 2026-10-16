import { describe, expect, it } from 'vitest';
import {
    DimensionType,
    FieldType,
    MetricType,
    type Dimension,
    type ItemsMap,
} from '../../types/field';
import { type ResultRow } from '../../types/results';
import {
    createColorMappings,
    type ColorMappings,
} from '../../visualizations/colors/mappings';
import {
    VizAggregationOptions,
    type PivotValuesColumn,
} from '../../visualizations/types';
import {
    buildDataAppVizContext,
    resolveDataAppVizColors,
} from './dataAppVizContext';
import { type DataAppVizSchema } from './types';

const statusDimension: Dimension = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name: 'status',
    label: 'Status',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.status',
    hidden: false,
    colors: { Completed: '#00ff00' },
};

const regionDimension: Dimension = {
    ...statusDimension,
    name: 'region',
    label: 'Region',
    sql: '${TABLE}.region',
    colors: {},
};

const itemsMap = {
    orders_status: statusDimension,
    orders_region: regionDimension,
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
        {
            name: 'value',
            label: 'Value',
            type: 'metric',
            required: true,
            multiple: true,
        },
    ],
    configOptions: [
        {
            type: 'boolean',
            name: 'showLegend',
            label: 'Show legend',
            default: true,
        },
        {
            type: 'text',
            name: 'title',
            label: 'Title',
            default: 'Orders',
        },
    ],
    colorPalette: null,
};

const colorPalette = ['#111111', '#222222', '#333333'];
const nullColor = '#999999';

const cell = (raw: unknown, formatted: string) => ({
    value: { raw, formatted },
});

const rows: ResultRow[] = [
    {
        orders_status: cell('completed', 'Completed'),
        orders_count: cell(1, '1'),
    },
    { orders_status: cell('pending', 'Pending'), orders_count: cell(2, '2') },
    { orders_status: cell(null, 'null'), orders_count: cell(3, '3') },
];

const pivotColumn = (status: string): PivotValuesColumn => ({
    referenceField: 'orders_count',
    pivotColumnName: `count_${status}`,
    aggregation: VizAggregationOptions.COUNT,
    pivotValues: [{ referenceField: 'orders_status', value: status }],
});

const pivotDetails = {
    totalColumnCount: 2,
    indexColumn: undefined,
    valuesColumns: [pivotColumn('Completed'), pivotColumn('pending')],
    groupByColumns: undefined,
    sortBy: undefined,
    originalColumns: {},
};

const resolveColors = (
    overrides: Partial<Parameters<typeof resolveDataAppVizColors>[0]> = {},
) =>
    resolveDataAppVizColors({
        itemsMap,
        rows,
        fieldMapping: { category: 'orders_status', value: ['orders_count'] },
        pivotDetails: null,
        colorPalette,
        colorMappings: createColorMappings(),
        nullColor,
        isCalculateSeriesColorEnabled: true,
        ...overrides,
    });

describe('resolveDataAppVizColors', () => {
    it('colours each mapped dimension value: model colour, then shared assignment, null colour for nulls', () => {
        expect(resolveColors().valueColors).toEqual({
            orders_status: {
                completed: '#00ff00',
                pending: '#111111',
                null: nullColor,
            },
        });
    });

    it('colours every dimension of a multiple binding and skips metrics', () => {
        const { valueColors } = resolveColors({
            rows: [
                {
                    orders_status: cell('pending', 'Pending'),
                    orders_region: cell('emea', 'EMEA'),
                },
            ],
            fieldMapping: {
                categories: ['orders_status', 'orders_region'],
                value: 'orders_count',
            },
        });

        expect(valueColors).toEqual({
            orders_status: { pending: '#111111' },
            orders_region: { emea: '#111111' },
        });
    });

    it('continues the assignments already in the shared colour mappings', () => {
        const colorMappings: ColorMappings = new Map([
            [
                'orders_status',
                new Map([
                    ['Pending', 2],
                    ['$___idx', 2],
                ]),
            ],
        ]);

        expect(
            resolveColors({ colorMappings }).valueColors.orders_status.pending,
        ).toBe('#333333');
        expect(colorMappings.get('orders_status')?.get('Pending')).toBe(2);
    });

    it('assigns pivot series through the shared mappings when series colour calculation is on', () => {
        const colorMappings = createColorMappings();

        expect(
            resolveColors({ pivotDetails, colorMappings }).seriesColors,
        ).toEqual({ count_Completed: '#00ff00', count_pending: '#111111' });
        expect(colorMappings.get('orders_count')?.get('pending')).toBe(0);
    });

    it('falls back to palette order without touching the mappings when series colour calculation is off', () => {
        const colorMappings = createColorMappings();

        expect(
            resolveColors({
                pivotDetails,
                colorMappings,
                fieldMapping: {},
                isCalculateSeriesColorEnabled: false,
            }).seriesColors,
        ).toEqual({ count_Completed: '#00ff00', count_pending: '#111111' });
        expect(colorMappings.size).toBe(0);
    });

    it('leaves series uncoloured with an empty palette and no model colour', () => {
        expect(
            resolveColors({
                pivotDetails: {
                    ...pivotDetails,
                    valuesColumns: [pivotColumn('pending')],
                },
                colorPalette: [],
                isCalculateSeriesColorEnabled: false,
            }).seriesColors,
        ).toEqual({});
    });
});

describe('buildDataAppVizContext', () => {
    const resolvedColors = {
        seriesColors: { count_pending: '#111111' },
        valueColors: { orders_status: { pending: '#222222' } },
    };
    const build = (
        overrides: Partial<Parameters<typeof buildDataAppVizContext>[0]> = {},
    ) =>
        buildDataAppVizContext({
            schema,
            itemsMap,
            fieldMapping: {
                category: 'orders_status',
                value: ['orders_count'],
            },
            rows,
            pivotDetails: null,
            colorPalette,
            optionValues: {},
            resolvedColors,
            ...overrides,
        });

    it('builds the whole context for a single and a multiple binding', () => {
        expect(build()).toEqual({
            fieldMapping: {
                category: 'orders_status',
                value: ['orders_count'],
            },
            fields: {
                orders_status: { label: 'Status', tableLabel: 'Orders' },
                orders_count: {
                    label: 'Count',
                    tableLabel: 'Orders',
                    format: { type: 'number' },
                },
            },
            rows,
            options: { showLegend: true, title: 'Orders' },
            colorPalette,
            seriesColors: { count_pending: '#111111' },
            valueColors: { orders_status: { pending: '#222222' } },
            pivotDetails: null,
            underlyingData: { enabled: false },
            drillDown: { enabled: false },
            pointMenu: { enabled: false },
            subtotals: { enabled: false, dimensions: [] },
        });
    });

    it('keeps set option values and defaults the rest', () => {
        expect(build({ optionValues: { showLegend: false } }).options).toEqual({
            showLegend: false,
            title: 'Orders',
        });
    });

    it('passes rows and pivot details through untouched', () => {
        const context = build({ pivotDetails });

        expect(context.rows).toBe(rows);
        expect(context.pivotDetails).toBe(pivotDetails);
    });

    it('describes only the bound fields the items map knows', () => {
        expect(
            build({ fieldMapping: { category: 'orders_missing' } }).fields,
        ).toEqual({});
    });
});
