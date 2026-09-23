import {
    DimensionType,
    FieldType,
    MetricType,
    type DataAppVizFieldMapping,
    type DataAppVizSchema,
    type ItemsMap,
} from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as explorePreviewQuery from '../utils/explorePreviewQuery';
import {
    type LoadedExplore,
    useExplorePreviewData,
} from './useExplorePreviewData';

vi.mock('../utils/explorePreviewQuery', async (importOriginal) => ({
    ...(await importOriginal<typeof explorePreviewQuery>()),
    executeExplorePreviewQuery: vi.fn(),
}));

const dimension = (name: string, type = DimensionType.STRING) => ({
    fieldType: FieldType.DIMENSION as const,
    type,
    name,
    label: name,
    table: 'orders',
    tableLabel: 'Orders',
    sql: `\${TABLE}.${name}`,
    hidden: false,
});

const itemsMap = {
    orders_date: dimension('date', DimensionType.DATE),
    orders_status: dimension('status'),
    orders_region: dimension('region'),
    orders_count: {
        ...dimension('count'),
        fieldType: FieldType.METRIC as const,
        type: MetricType.COUNT,
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
        { name: 'colour', label: 'Colour', type: 'series', required: true },
        { name: 'facet', label: 'Facet', type: 'series', required: true },
        { name: 'value', label: 'Value', type: 'metric', required: true },
    ],
    configOptions: [],
    colorPalette: null,
};

const initialMapping: DataAppVizFieldMapping = {
    category: 'orders_date',
    colour: 'orders_status',
    facet: 'orders_region',
    value: 'orders_count',
};
const swappedMapping: DataAppVizFieldMapping = {
    category: 'orders_date',
    colour: 'orders_region',
    facet: 'orders_status',
    value: 'orders_count',
};

const explore = (name = 'orders'): LoadedExplore => ({
    name,
    label: name,
    joinedTableLabels: [],
    fields: Object.entries(itemsMap).map(([id, item]) => ({
        id,
        label: item.label,
        item,
    })),
    itemsMap,
});

const result = (marker: string) => ({
    rows: [{ marker: { value: { raw: marker, formatted: marker } } }],
    itemsMap,
    pivotDetails: null,
});

const createWrapper = () => {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    return ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
};

describe('useExplorePreviewData', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.mocked(explorePreviewQuery.executeExplorePreviewQuery).mockReset();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('reruns when the same fields swap series roles and keeps the applied mapping with prior rows', async () => {
        let resolveSecond: ((value: ReturnType<typeof result>) => void) | null =
            null;
        vi.mocked(explorePreviewQuery.executeExplorePreviewQuery)
            .mockResolvedValueOnce(result('first'))
            .mockImplementationOnce(
                () =>
                    new Promise((resolve) => {
                        resolveSecond = resolve;
                    }),
            );
        const { result: hook, rerender } = renderHook(
            ({ fieldMapping }) =>
                useExplorePreviewData({
                    projectUuid: 'project-1',
                    explore: explore(),
                    schema,
                    fieldMapping,
                }),
            {
                initialProps: { fieldMapping: initialMapping },
                wrapper: createWrapper(),
            },
        );

        await vi.waitFor(() => expect(hook.current.run.status).toBe('ready'));
        expect(hook.current.run).toMatchObject({
            status: 'ready',
            fieldMapping: initialMapping,
        });
        expect(
            explorePreviewQuery.executeExplorePreviewQuery,
        ).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                query: expect.objectContaining({
                    dimensions: [
                        'orders_date',
                        'orders_status',
                        'orders_region',
                    ],
                    metrics: ['orders_count'],
                }),
                pivotConfiguration: expect.objectContaining({
                    indexColumn: [
                        expect.objectContaining({ reference: 'orders_date' }),
                    ],
                    groupByColumns: [
                        { reference: 'orders_status' },
                        { reference: 'orders_region' },
                    ],
                    valuesColumns: [
                        expect.objectContaining({ reference: 'orders_count' }),
                    ],
                }),
            }),
        );

        rerender({ fieldMapping: swappedMapping });
        expect(hook.current).toMatchObject({
            isRunning: true,
            run: { status: 'ready', fieldMapping: initialMapping },
        });

        await act(async () => vi.advanceTimersByTimeAsync(399));
        expect(
            explorePreviewQuery.executeExplorePreviewQuery,
        ).toHaveBeenCalledTimes(1);
        await act(async () => vi.advanceTimersByTimeAsync(1));
        expect(
            explorePreviewQuery.executeExplorePreviewQuery,
        ).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({
                pivotConfiguration: expect.objectContaining({
                    groupByColumns: [
                        { reference: 'orders_region' },
                        { reference: 'orders_status' },
                    ],
                }),
            }),
        );
        expect(hook.current.run).toMatchObject({
            status: 'ready',
            fieldMapping: initialMapping,
        });

        await act(async () => resolveSecond?.(result('second')));
        await vi.waitFor(() =>
            expect(hook.current.run).toMatchObject({
                status: 'ready',
                fieldMapping: swappedMapping,
            }),
        );
    });

    it('does not rerun for an equivalent binding object', async () => {
        vi.mocked(
            explorePreviewQuery.executeExplorePreviewQuery,
        ).mockResolvedValue(result('first'));
        const { result: hook, rerender } = renderHook(
            ({ fieldMapping }) =>
                useExplorePreviewData({
                    projectUuid: 'project-1',
                    explore: explore(),
                    schema,
                    fieldMapping,
                }),
            {
                initialProps: { fieldMapping: initialMapping },
                wrapper: createWrapper(),
            },
        );
        await vi.waitFor(() => expect(hook.current.run.status).toBe('ready'));

        rerender({ fieldMapping: { ...initialMapping } });
        await act(async () => vi.advanceTimersByTimeAsync(400));

        expect(
            explorePreviewQuery.executeExplorePreviewQuery,
        ).toHaveBeenCalledTimes(1);
    });

    it('does not expose or run the prior request against a newly attached explore', async () => {
        vi.mocked(
            explorePreviewQuery.executeExplorePreviewQuery,
        ).mockResolvedValue(result('first'));
        const { result: hook, rerender } = renderHook(
            ({ attachedExplore }) =>
                useExplorePreviewData({
                    projectUuid: 'project-1',
                    explore: attachedExplore,
                    schema,
                    fieldMapping: initialMapping,
                }),
            {
                initialProps: { attachedExplore: explore('orders') },
                wrapper: createWrapper(),
            },
        );
        await vi.waitFor(() => expect(hook.current.run.status).toBe('ready'));

        rerender({ attachedExplore: explore('customers') });

        expect(hook.current.run.status).toBe('running');
        expect(
            explorePreviewQuery.executeExplorePreviewQuery,
        ).toHaveBeenCalledTimes(1);
        await act(async () => vi.advanceTimersByTimeAsync(400));
        await vi.waitFor(() =>
            expect(
                explorePreviewQuery.executeExplorePreviewQuery,
            ).toHaveBeenCalledTimes(2),
        );
        expect(
            explorePreviewQuery.executeExplorePreviewQuery,
        ).toHaveBeenLastCalledWith(
            expect.objectContaining({
                query: expect.objectContaining({ exploreName: 'customers' }),
            }),
        );
    });
});
