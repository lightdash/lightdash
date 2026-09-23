import {
    ChartType,
    DimensionType,
    FieldType,
    MetricType,
    VizAggregationOptions,
    VizIndexType,
    type DataAppVizSchema,
    type DataAppVizFieldMapping,
} from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeSavedChartPreviewQuery } from '../utils/savedChartPreviewQuery';
import { useSavedChartBindingPreview } from './useSavedChartBindingPreview';
import { type SavedChartPreviewRun } from './useSavedChartPreviewData';

vi.mock('../utils/savedChartPreviewQuery', () => ({
    executeSavedChartPreviewQuery: vi.fn(),
}));
const dimension = (name: string) => ({
    name,
    label: name,
    table: 'orders',
    tableLabel: 'Orders',
    sql: name,
    hidden: false,
    fieldType: FieldType.DIMENSION as const,
    type: DimensionType.STRING,
});
const itemsMap = {
    orders_date: dimension('date'),
    orders_status: dimension('status'),
    orders_count: {
        ...dimension('count'),
        fieldType: FieldType.METRIC as const,
        type: MetricType.COUNT,
    },
};
const schema: DataAppVizSchema = {
    fields: [
        {
            name: 'category',
            label: 'Category',
            type: 'dimension',
            required: true,
        },
        { name: 'series', label: 'Series', type: 'series', required: false },
        { name: 'value', label: 'Value', type: 'metric', required: true },
    ],
    configOptions: [],
    colorPalette: null,
};
const originalMapping = {
    category: 'orders_date',
    series: 'orders_status',
    value: 'orders_count',
};
const source: SavedChartPreviewRun = {
    retry: vi.fn(),
    data: {
        status: 'ready',
        chartName: 'Orders',
        spaceName: null,
        itemsMap,
        columns: Object.values(itemsMap),
        rows: [],
        rowCount: 0,
        ranAt: new Date(),
        sourceChart: {
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_date', 'orders_status'],
                metrics: ['orders_count'],
                tableCalculations: [],
                sorts: [],
                filters: {},
                limit: 500,
            },
            chartConfig: {
                type: ChartType.CARTESIAN,
                config: {
                    layout: { xField: 'orders_date', yField: ['orders_count'] },
                    eChartsConfig: {},
                },
            },
            pivotConfig: { columns: ['orders_status'] },
        },
        pivotDetails: {
            indexColumn: [
                { reference: 'orders_date', type: VizIndexType.CATEGORY },
            ],
            groupByColumns: [{ reference: 'orders_status' }],
            totalColumnCount: 1,
            originalColumns: {},
            sortBy: undefined,
            valuesColumns: [
                {
                    referenceField: 'orders_count',
                    pivotColumnName: 'count_placed',
                    aggregation: VizAggregationOptions.ANY,
                    columnIndex: 1,
                    pivotValues: [
                        { referenceField: 'orders_status', value: 'placed' },
                    ],
                },
            ],
        },
    },
};
const wrapper = () => {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
};
const renderPreview = () =>
    renderHook(
        ({
            mapping,
            chartUuid,
        }: {
            mapping: DataAppVizFieldMapping;
            chartUuid: string;
        }) =>
            useSavedChartBindingPreview({
                projectUuid: 'p1',
                savedChartUuid: chartUuid,
                source,
                schema,
                fieldMapping: mapping,
            }),
        {
            wrapper: wrapper(),
            initialProps: {
                mapping: originalMapping as DataAppVizFieldMapping,
                chartUuid: 'chart-a',
            },
        },
    );

describe('useSavedChartBindingPreview', () => {
    beforeEach(() => {
        vi.mocked(executeSavedChartPreviewQuery)
            .mockReset()
            .mockResolvedValue({ rows: [], itemsMap, pivotDetails: null });
    });
    it('reuses the native backend pivot when it matches the bindings', async () => {
        const { result } = renderPreview();
        await waitFor(() => expect(result.current.data.status).toBe('ready'));
        expect(executeSavedChartPreviewQuery).not.toHaveBeenCalled();
        expect(result.current.fieldMapping).toEqual(originalMapping);
    });
    it('debounces regrouping the same fields and keeps the applied mapping while pending', async () => {
        const { result, rerender } = renderPreview();
        await waitFor(() => expect(result.current.data.status).toBe('ready'));
        const next = {
            ...originalMapping,
            category: 'orders_status',
            series: 'orders_date',
        };
        rerender({ mapping: next, chartUuid: 'chart-a' });
        expect(executeSavedChartPreviewQuery).not.toHaveBeenCalled();
        expect(result.current.fieldMapping).toEqual(originalMapping);
        await waitFor(() =>
            expect(executeSavedChartPreviewQuery).toHaveBeenCalledOnce(),
        );
        expect(executeSavedChartPreviewQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                pivotResults: false,
                pivotConfiguration: expect.objectContaining({
                    groupByColumns: [{ reference: 'orders_date' }],
                    indexColumn: [
                        {
                            reference: 'orders_status',
                            type: VizIndexType.CATEGORY,
                        },
                    ],
                }),
            }),
        );
        await waitFor(() => expect(result.current.fieldMapping).toEqual(next));
    });
    it('requests flat backend results when the series is cleared', async () => {
        const { result, rerender } = renderPreview();
        await waitFor(() => expect(result.current.data.status).toBe('ready'));
        rerender({
            mapping: { ...originalMapping, series: [] },
            chartUuid: 'chart-a',
        });
        await waitFor(() =>
            expect(executeSavedChartPreviewQuery).toHaveBeenCalledOnce(),
        );
        expect(executeSavedChartPreviewQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                pivotResults: false,
                pivotConfiguration: undefined,
            }),
        );
    });
    it('surfaces an override failure and retries the bound query', async () => {
        const { result, rerender } = renderPreview();
        await waitFor(() => expect(result.current.data.status).toBe('ready'));
        vi.mocked(executeSavedChartPreviewQuery).mockRejectedValueOnce(
            new Error('Pivot failed'),
        );
        rerender({
            mapping: { ...originalMapping, series: [] },
            chartUuid: 'chart-a',
        });
        await waitFor(() =>
            expect(result.current.data).toMatchObject({
                status: 'error',
                message: 'Pivot failed',
            }),
        );
        act(() => result.current.retry());
        await waitFor(() => expect(result.current.data.status).toBe('ready'));
        expect(executeSavedChartPreviewQuery).toHaveBeenCalledTimes(2);
    });
});
