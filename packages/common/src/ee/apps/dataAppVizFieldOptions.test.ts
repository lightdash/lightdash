import { VizAggregationOptions } from '../../visualizations/types';
import {
    getDataAppVizFieldOptions,
    pruneDataAppVizFieldOptionValues,
} from './dataAppVizFieldOptions';
import { type DataAppVizField } from './types';

const fields: DataAppVizField[] = [
    { name: 'category', label: 'Category', type: 'dimension', required: true },
    {
        name: 'values',
        label: 'Values',
        type: 'metric',
        required: true,
        multiple: true,
        configOptions: [
            { type: 'color', name: 'color', label: 'Colour', default: '#000' },
            {
                type: 'boolean',
                name: 'dashed',
                label: 'Dashed',
                default: false,
            },
        ],
    },
];
const fieldMapping = {
    category: 'orders_status',
    values: ['orders_total', 'orders_count'],
};

const noData = { rows: [], pivotDetails: null };
const cell = (raw: unknown) => ({ value: { raw, formatted: String(raw) } });

describe('getDataAppVizFieldOptions', () => {
    it('resolves each bound field separately, falling back to defaults', () => {
        expect(
            getDataAppVizFieldOptions(
                fields,
                fieldMapping,
                {
                    values: {
                        orders_total: { color: '#f00', dashed: 'yes' },
                        orders_unbound: { color: '#0f0' },
                    },
                },
                noData,
            ),
        ).toEqual({
            values: {
                orders_total: { color: '#f00', dashed: false },
                orders_count: { color: '#000', dashed: false },
            },
        });
    });

    it('is empty for a viz without per-field options', () => {
        expect(
            getDataAppVizFieldOptions([fields[0]], fieldMapping, {}, noData),
        ).toEqual({});
    });
});

describe('getDataAppVizFieldOptions gradients', () => {
    const gradientFields: DataAppVizField[] = [
        {
            name: 'values',
            label: 'Values',
            type: 'metric',
            required: true,
            multiple: true,
            configOptions: [
                {
                    type: 'gradient',
                    name: 'scale',
                    label: 'Scale',
                    default: {
                        colors: ['#000000', '#ffffff'],
                        min: 'auto',
                        max: 'auto',
                    },
                },
            ],
        },
    ];
    const mapping = { values: ['orders_total', 'orders_count'] };

    it('resolves auto bounds from each field across its pivot columns', () => {
        expect(
            getDataAppVizFieldOptions(
                gradientFields,
                mapping,
                {
                    values: {
                        orders_count: {
                            scale: {
                                colors: ['#ff0000', '#00ff00', '#0000ff'],
                                min: 0,
                                max: 'auto',
                            },
                        },
                    },
                },
                {
                    rows: [
                        {
                            orders_total_a: cell(10),
                            orders_total_b: cell(40),
                            orders_count_a: cell('3'),
                            orders_count_b: cell(null),
                        },
                        {
                            orders_total_a: cell(-5),
                            orders_total_b: cell('n/a'),
                            orders_count_a: cell(7),
                            orders_count_b: cell(1),
                        },
                    ],
                    pivotDetails: {
                        totalColumnCount: null,
                        indexColumn: undefined,
                        valuesColumns: [
                            'orders_total_a',
                            'orders_total_b',
                            'orders_count_a',
                            'orders_count_b',
                        ].map((pivotColumnName) => ({
                            referenceField: pivotColumnName.slice(0, -2),
                            pivotColumnName,
                            aggregation: VizAggregationOptions.ANY,
                            pivotValues: [],
                        })),
                        groupByColumns: undefined,
                        sortBy: undefined,
                        originalColumns: {},
                    },
                },
            ),
        ).toEqual({
            values: {
                orders_total: {
                    scale: { colors: ['#000000', '#ffffff'], min: -5, max: 40 },
                },
                orders_count: {
                    scale: {
                        colors: ['#ff0000', '#00ff00', '#0000ff'],
                        min: 0,
                        max: 7,
                    },
                },
            },
        });
    });

    it('resolves an index dimension from its own column when pivoted', () => {
        const dimensionGradient: DataAppVizField = {
            name: 'x',
            label: 'X',
            type: 'dimension',
            required: true,
            configOptions: gradientFields[0].configOptions,
        };
        const seriesGradient: DataAppVizField = {
            ...dimensionGradient,
            name: 'series',
            label: 'Series',
            type: 'series',
            required: false,
        };
        const result = getDataAppVizFieldOptions(
            [dimensionGradient, seriesGradient, gradientFields[0]],
            {
                x: 'orders_year',
                series: 'orders_region',
                values: ['orders_total'],
            },
            {},
            {
                rows: [
                    {
                        orders_year: cell(2021),
                        orders_total_a: cell(10),
                        orders_total_b: cell(40),
                    },
                    {
                        orders_year: cell('2024'),
                        orders_total_a: cell(-5),
                        orders_total_b: cell(null),
                    },
                ],
                pivotDetails: {
                    totalColumnCount: null,
                    indexColumn: undefined,
                    valuesColumns: ['orders_total_a', 'orders_total_b'].map(
                        (pivotColumnName) => ({
                            referenceField: 'orders_total',
                            pivotColumnName,
                            aggregation: VizAggregationOptions.ANY,
                            pivotValues: [],
                        }),
                    ),
                    groupByColumns: undefined,
                    sortBy: undefined,
                    originalColumns: {},
                },
            },
        );

        const colors = ['#000000', '#ffffff'];
        expect(result).toEqual({
            x: {
                orders_year: { scale: { colors, min: 2021, max: 2024 } },
            },
            series: {
                orders_region: { scale: { colors, min: null, max: null } },
            },
            values: {
                orders_total: { scale: { colors, min: -5, max: 40 } },
            },
        });
    });

    it('delivers null bounds for a field without numeric values', () => {
        expect(
            getDataAppVizFieldOptions(gradientFields, mapping, {}, noData),
        ).toEqual({
            values: {
                orders_total: {
                    scale: {
                        colors: ['#000000', '#ffffff'],
                        min: null,
                        max: null,
                    },
                },
                orders_count: {
                    scale: {
                        colors: ['#000000', '#ffffff'],
                        min: null,
                        max: null,
                    },
                },
            },
        });
    });
});

describe('pruneDataAppVizFieldOptionValues', () => {
    it('keeps values across a reorder and drops unbound fields, undeclared options and stale types', () => {
        expect(
            pruneDataAppVizFieldOptionValues(
                fields,
                { values: ['orders_count', 'orders_total'] },
                {
                    values: {
                        orders_total: { color: '#f00', width: 3 },
                        orders_count: { dashed: 'yes' },
                        orders_removed: { color: '#0f0' },
                    },
                    category: { orders_status: { color: '#00f' } },
                    removed_input: { orders_total: { color: '#00f' } },
                },
            ),
        ).toEqual({ values: { orders_total: { color: '#f00' } } });
    });
});
