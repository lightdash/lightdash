import {
    CartesianSeriesType,
    DimensionType,
    FieldType,
    MetricType,
    VizAggregationOptions,
    type Dimension,
    type EChartsSeries,
    type ItemsMap,
    type ReadyQueryResultsPage,
    type ResultRow,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { renderHook } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChartColorMappingContext } from '../../../hooks/useChartColorConfig/context';
import { useChartColorConfig } from '../../../hooks/useChartColorConfig/useChartColorConfig';
import { calculateSeriesLikeIdentifier } from '../../../hooks/useChartColorConfig/utils';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { getMantineThemeOverride } from '../../../theme';
import { useDataAppVizResolvedColors } from './useDataAppVizResolvedColors';

vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: vi.fn(),
}));

const statusDimension: Dimension = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name: 'status',
    label: 'Status',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.status',
    hidden: false,
    colors: { completed: '#00ff00' },
};
const priorityDimension: Dimension = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.NUMBER,
    name: 'priority',
    label: 'Priority',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.priority',
    hidden: false,
    colors: { '1': '#ff0000' },
};

const itemsMap = {
    orders_status: statusDimension,
    orders_priority: priorityDimension,
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
    orders_total: {
        fieldType: FieldType.METRIC,
        type: MetricType.SUM,
        name: 'total',
        label: 'Total',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '${TABLE}.total',
        hidden: false,
    },
} satisfies ItemsMap;

const cell = (raw: unknown) => ({
    value: { raw, formatted: String(raw ?? '') },
});

const pivotDetails = (
    valuesColumns: NonNullable<
        ReadyQueryResultsPage['pivotDetails']
    >['valuesColumns'],
): ReadyQueryResultsPage['pivotDetails'] =>
    ({
        totalColumnCount: valuesColumns.length,
        indexColumn: undefined,
        valuesColumns,
        groupByColumns: undefined,
        sortBy: undefined,
        originalColumns: {},
    }) as ReadyQueryResultsPage['pivotDetails'];

// One mapping store per render, so the shared assignment starts from scratch
// in each test but stays stable across re-renders.
const makeWrapper = () => {
    const colorMappings = new Map<string, Map<string, number>>();
    return ({ children }: PropsWithChildren) => (
        <MantineProvider theme={getMantineThemeOverride('light')}>
            <ChartColorMappingContext.Provider value={{ colorMappings }}>
                {children}
            </ChartColorMappingContext.Provider>
        </MantineProvider>
    );
};

const colorPalette = ['#111111', '#222222', '#333333'];

const renderResolvedColors = (
    overrides: Partial<Parameters<typeof useDataAppVizResolvedColors>[0]> = {},
) =>
    renderHook(
        () =>
            useDataAppVizResolvedColors({
                itemsMap,
                rows: [],
                fieldMapping: {},
                pivotDetails: null,
                colorPalette,
                ...overrides,
            }),
        { wrapper: makeWrapper() },
    );

describe('useDataAppVizResolvedColors', () => {
    beforeEach(() => {
        vi.mocked(useServerFeatureFlag).mockReturnValue({
            data: { enabled: true },
        } as ReturnType<typeof useServerFeatureFlag>);
    });

    it('keeps model-defined colors and shares assignments for the remaining pivot series', () => {
        const { result } = renderResolvedColors({
            pivotDetails: pivotDetails([
                {
                    referenceField: 'orders_count',
                    pivotColumnName: 'count_completed',
                    aggregation: VizAggregationOptions.COUNT,
                    pivotValues: [
                        {
                            referenceField: 'orders_status',
                            value: 'completed',
                        },
                    ],
                },
                {
                    referenceField: 'orders_count',
                    pivotColumnName: 'count_pending',
                    aggregation: VizAggregationOptions.COUNT,
                    pivotValues: [
                        {
                            referenceField: 'orders_status',
                            value: 'pending',
                        },
                    ],
                },
            ]),
        });

        expect(result.current.seriesColors).toEqual({
            count_completed: '#00ff00',
            count_pending: '#111111',
        });
    });

    it('falls back to the palette in the same order a built-in chart assigns it when shared series assignment is disabled', () => {
        vi.mocked(useServerFeatureFlag).mockReturnValue({
            data: { enabled: false },
        } as ReturnType<typeof useServerFeatureFlag>);

        const column = (value: string) => ({
            referenceField: 'orders_count',
            pivotColumnName: `count_${value}`,
            aggregation: VizAggregationOptions.COUNT,
            pivotValues: [{ referenceField: 'orders_status', value }],
        });
        const { result } = renderResolvedColors({
            colorPalette: ['#111111', '#222222', '#333333', '#444444'],
            pivotDetails: pivotDetails([
                column('completed'),
                column('returned'),
                column('return_pending'),
                column('shipped'),
            ]),
        });

        // Built-in charts rank every series identifier in descending order and
        // walk the palette in that order, fixed-color series included.
        expect(result.current.seriesColors).toEqual({
            count_completed: '#00ff00',
            count_shipped: '#111111',
            count_returned: '#222222',
            count_return_pending: '#333333',
        });
    });

    it('resolves every distinct raw value for mapped dimensions in unpivoted rows', () => {
        const rows: ResultRow[] = [
            {
                orders_status: cell('completed'),
                orders_priority: cell(1),
            },
            {
                orders_status: cell('pending'),
                orders_priority: cell(null),
            },
            {
                orders_status: cell('pending'),
                orders_priority: cell(null),
            },
        ];
        const { result } = renderResolvedColors({
            rows,
            fieldMapping: {
                category: 'orders_status',
                series: 'orders_priority',
                metric: 'orders_count',
            },
        });

        expect(result.current.seriesColors).toEqual({});
        expect(result.current.valueColors.orders_status).toEqual({
            completed: '#00ff00',
            pending: '#111111',
        });
        expect(result.current.valueColors.orders_priority).toEqual({
            '1': '#ff0000',
            null: '#868e96',
        });
        expect(result.current.valueColors.orders_count).toBeUndefined();
    });

    it('resolves grouped values by their formatted label, keyed by raw value', () => {
        const amountDimension: Dimension = {
            ...priorityDimension,
            name: 'amount',
            label: 'Amount',
            sql: '${TABLE}.amount',
            colors: { '1,000': '#00aa00' },
        };
        const rows: ResultRow[] = [
            { orders_amount: { value: { raw: 1000, formatted: '1,000' } } },
            { orders_amount: { value: { raw: 2500, formatted: '2,500' } } },
            { orders_amount: { value: { raw: 1000, formatted: '1,000' } } },
        ];
        const wrapper = makeWrapper();
        const colorConfig = renderHook(
            () => useChartColorConfig({ colorPalette }),
            { wrapper },
        );
        const { result } = renderHook(
            () =>
                useDataAppVizResolvedColors({
                    itemsMap: { ...itemsMap, orders_amount: amountDimension },
                    rows,
                    fieldMapping: { category: 'orders_amount' },
                    pivotDetails: null,
                    colorPalette,
                }),
            { wrapper },
        );

        expect(result.current.valueColors.orders_amount).toEqual({
            '1000': '#00aa00',
            '2500': colorConfig.result.current.calculateKeyColorAssignment(
                'orders_amount',
                '2,500',
            ),
        });
    });

    it('cycles the palette per metric for a multi-metric pivot', () => {
        const { result } = renderResolvedColors({
            pivotDetails: pivotDetails([
                {
                    referenceField: 'orders_count',
                    pivotColumnName: 'count_pending',
                    aggregation: VizAggregationOptions.COUNT,
                    pivotValues: [
                        { referenceField: 'orders_status', value: 'pending' },
                    ],
                },
                {
                    referenceField: 'orders_count',
                    pivotColumnName: 'count_shipped',
                    aggregation: VizAggregationOptions.COUNT,
                    pivotValues: [
                        { referenceField: 'orders_status', value: 'shipped' },
                    ],
                },
                {
                    referenceField: 'orders_total',
                    pivotColumnName: 'total_pending',
                    aggregation: VizAggregationOptions.SUM,
                    pivotValues: [
                        { referenceField: 'orders_status', value: 'pending' },
                    ],
                },
            ]),
        });

        expect(result.current.seriesColors).toEqual({
            count_pending: '#111111',
            count_shipped: '#222222',
            total_pending: '#111111',
        });
    });

    it('assigns each pivot column the color its equivalent built-in series gets', () => {
        const valuesColumns = [
            {
                referenceField: 'orders_count',
                pivotColumnName: 'count_pending',
                aggregation: VizAggregationOptions.COUNT,
                pivotValues: [
                    { referenceField: 'orders_status', value: 'pending' },
                ],
            },
            {
                referenceField: 'orders_count',
                pivotColumnName: 'count_shipped',
                aggregation: VizAggregationOptions.COUNT,
                pivotValues: [
                    { referenceField: 'orders_status', value: 'shipped' },
                ],
            },
        ];
        const wrapper = makeWrapper();
        const colorConfig = renderHook(
            () => useChartColorConfig({ colorPalette }),
            { wrapper },
        );
        // Claim the metric group's first slot so a series resolved through a
        // different group or identifier would land on a different color.
        const decoy = colorConfig.result.current.calculateKeyColorAssignment(
            'orders_count',
            'decoy',
        );
        const { result } = renderHook(
            () =>
                useDataAppVizResolvedColors({
                    itemsMap,
                    rows: [],
                    fieldMapping: {},
                    pivotDetails: pivotDetails(valuesColumns),
                    colorPalette,
                }),
            { wrapper },
        );

        valuesColumns.forEach((column) => {
            const builtInSeries: EChartsSeries = {
                type: CartesianSeriesType.BAR,
                pivotReference: {
                    field: column.referenceField,
                    pivotValues: column.pivotValues.map(
                        ({ referenceField, value }) => ({
                            field: referenceField,
                            value,
                        }),
                    ),
                },
            };
            const [group, identifier] =
                calculateSeriesLikeIdentifier(builtInSeries);

            const seriesColor =
                result.current.seriesColors[column.pivotColumnName];

            expect(seriesColor).not.toBe(decoy);
            expect(seriesColor).toBe(
                colorConfig.result.current.calculateKeyColorAssignment(
                    group,
                    identifier,
                ),
            );
        });
    });
});
