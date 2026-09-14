/// <reference types="vitest/globals" />
import {
    DimensionType,
    FieldType,
    MetricType,
    type ApiExploreResults,
    type CompiledDimension,
    type CompiledMetric,
    type EChartsSeries,
    type SavedChart,
} from '@lightdash/common';
import { type EchartsSeriesClickEvent } from '../SimpleChart';
import {
    getDashboardTileContextMenuOptions,
    shouldOpenEmbeddedChartContextMenu,
} from './getDashboardTileContextMenuOptions';

const statusDimension: CompiledDimension = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name: 'status',
    label: 'Status',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '',
    compiledSql: '',
    tablesReferences: ['orders'],
    hidden: false,
};

const priorityDimension: CompiledDimension = {
    ...statusDimension,
    name: 'priority',
    label: 'Priority',
};

const countMetric: CompiledMetric = {
    fieldType: FieldType.METRIC,
    type: MetricType.COUNT,
    name: 'count',
    label: 'Count',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '',
    compiledSql: '',
    tablesReferences: ['orders'],
    hidden: false,
};

const explore = {
    name: 'orders',
    label: 'Orders',
    baseTable: 'orders',
    joinedTables: [],
    tables: {
        orders: {
            name: 'orders',
            label: 'Orders',
            dimensions: {
                status: statusDimension,
                priority: priorityDimension,
            },
            metrics: { count: countMetric },
        },
    },
} as unknown as ApiExploreResults;

const chart = {
    metricQuery: {
        dimensions: ['orders_status', 'orders_priority'],
        metrics: ['orders_count'],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [],
        additionalMetrics: [],
        customDimensions: [],
    },
    pivotConfig: undefined,
} as unknown as Pick<SavedChart, 'metricQuery' | 'pivotConfig'>;

const series = [
    {
        type: 'bar',
        encode: {
            x: 'orders_status',
            y: 'orders_count',
            tooltip: [],
            seriesName: 'orders_count',
        },
    } as unknown as EChartsSeries,
];

const baseClickEvent = {
    componentType: 'series' as const,
    seriesIndex: 0,
    dataIndex: 0,
    dimensionNames: ['orders_status', 'orders_count'],
    event: { event: {} as MouseEvent },
} as EchartsSeriesClickEvent;

describe('getDashboardTileContextMenuOptions', () => {
    it('creates a temporary dashboard filter from a clicked dimension', () => {
        const options = getDashboardTileContextMenuOptions({
            clickEvent: {
                ...baseClickEvent,
                value: 12,
                data: {
                    orders_status: 'completed',
                    orders_count: 12,
                },
            },
            series,
            explore,
            chart,
        });

        expect(options.dashboardTileFilterOptions).toHaveLength(1);
        expect(options.dashboardTileFilterOptions[0]).toMatchObject({
            target: {
                fieldId: 'orders_status',
                fieldName: 'status',
                tableName: 'orders',
            },
            values: ['completed'],
        });
        expect(options.viewUnderlyingDataOptions.item).toBe(countMetric);
        expect(options.viewUnderlyingDataOptions.dimensions).toEqual([
            'orders_status',
            'orders_priority',
        ]);
    });

    it('creates filters for dimensions restored from a tuple dataset row', () => {
        const options = getDashboardTileContextMenuOptions({
            clickEvent: {
                ...baseClickEvent,
                value: ['completed', 12],
                data: { value: ['completed', 12] },
                datasetRow: {
                    orders_status: 'completed',
                    orders_priority: 'urgent',
                    orders_count: 12,
                },
            },
            series,
            explore,
            chart,
        });

        expect(options.dashboardTileFilterOptions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    target: expect.objectContaining({
                        fieldId: 'orders_status',
                    }),
                    values: ['completed'],
                }),
                expect.objectContaining({
                    target: expect.objectContaining({
                        fieldId: 'orders_priority',
                    }),
                    values: ['urgent'],
                }),
            ]),
        );
    });
});

describe('shouldOpenEmbeddedChartContextMenu', () => {
    it('does not open an empty menu for view-only embeds', () => {
        expect(
            shouldOpenEmbeddedChartContextMenu({
                canViewUnderlyingData: false,
                canExplore: false,
                canCrossFilter: false,
                dashboardTileFilterOptionsCount: 0,
            }),
        ).toBe(false);
    });

    it('does not open an empty menu when a click has no filterable fields', () => {
        expect(
            shouldOpenEmbeddedChartContextMenu({
                canViewUnderlyingData: false,
                canExplore: false,
                canCrossFilter: true,
                dashboardTileFilterOptionsCount: 0,
            }),
        ).toBe(false);
    });

    it.each([
        {
            canViewUnderlyingData: true,
            canExplore: false,
            canCrossFilter: false,
            dashboardTileFilterOptionsCount: 0,
        },
        {
            canViewUnderlyingData: false,
            canExplore: true,
            canCrossFilter: false,
            dashboardTileFilterOptionsCount: 0,
        },
        {
            canViewUnderlyingData: false,
            canExplore: false,
            canCrossFilter: true,
            dashboardTileFilterOptionsCount: 1,
        },
    ])('opens when an embedded action is available', (permissions) => {
        expect(shouldOpenEmbeddedChartContextMenu(permissions)).toBe(true);
    });
});
