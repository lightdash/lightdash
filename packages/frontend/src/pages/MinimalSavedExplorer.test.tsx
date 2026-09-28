import { ChartType, type SavedChart } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { VisualizationProviderProps } from '../components/LightdashVisualization/VisualizationProvider';
import { mockSavedChartResponse } from '../testing/savedChartResponse.mock';

const mocks = vi.hoisted(() => ({
    savedChart: undefined as SavedChart | undefined,
    queryError: null as Error | null,
    subtotalDimensions: null as string[] | null,
    rootQueryUuid: 'query-uuid',
    isPreviousData: false,
    executeSubtotal: vi.fn(),
    visualization: vi.fn(),
}));

vi.mock('../hooks/useSavedQuery', () => ({
    useSavedQuery: () => ({
        data: mocks.savedChart,
        isInitialLoading: false,
        isError: false,
    }),
}));
vi.mock('../hooks/useProjectUuid', () => ({
    useProjectUuid: () => '11111111-1111-4111-8111-111111111111',
}));
vi.mock('../hooks/useProjects', () => ({
    useProjects: () => ({ data: [], isInitialLoading: false, isError: false }),
}));
vi.mock('../hooks/useProject', () => ({
    useProject: () => ({
        data: {
            projectUuid: '11111111-1111-4111-8111-111111111111',
            slug: 'project-slug',
        },
        isInitialLoading: false,
        isError: false,
    }),
}));
vi.mock('../features/scheduler/hooks/useScheduler', () => ({
    useScheduler: () => ({ data: undefined, isInitialLoading: false }),
}));
vi.mock('../hooks/useSearchParams', () => ({ default: () => undefined }));
vi.mock('../hooks/useResizeObserver', () => ({
    useResizeObserver: () => [vi.fn(), { width: 800, height: 600 }],
}));
vi.mock('../hooks/useExplorerQueryEffects', () => ({
    useExplorerQueryEffects: vi.fn(),
}));
vi.mock('../hooks/useExplorerQuery', () => ({
    useExplorerQuery: () => ({
        query: {
            isFetching: false,
            isPreviousData: mocks.isPreviousData,
            error: mocks.queryError,
            data: {
                queryUuid: mocks.rootQueryUuid,
                metricQuery: {},
                fields: {},
            },
        },
        queryResults: {
            isFetchingRows: false,
            queryUuid: mocks.rootQueryUuid,
            error: mocks.queryError,
        },
        explore: undefined,
        subtotalDimensions: mocks.subtotalDimensions,
        validQueryArgs: {
            projectUuid: 'project-uuid',
            chartUuid: 'chart-uuid',
        },
    }),
}));
vi.mock('../hooks/useQueryResults', () => ({
    executeSubtotalQueryAndGetRows: mocks.executeSubtotal,
}));
vi.mock('../providers/App/useApp', () => ({
    default: () => ({ health: { isInitialLoading: false, data: {} } }),
}));
vi.mock('../components/MetricQueryData/MetricQueryDataProvider', () => ({
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../components/LightdashVisualization/VisualizationProvider', () => ({
    default: (props: PropsWithChildren<VisualizationProviderProps>) => {
        mocks.visualization(props);
        return <>{props.children}</>;
    },
}));
vi.mock('../components/MetricQueryData/UnderlyingDataModal', () => ({
    default: () => null,
}));
vi.mock('../components/LightdashVisualization', () => ({
    default: ({ onScreenshotReady }: { onScreenshotReady: () => void }) => (
        <button
            data-testid="signal-screenshot-ready"
            onClick={onScreenshotReady}
        >
            Signal screenshot ready
        </button>
    ),
}));

import MinimalSavedExplorer from './MinimalSavedExplorer';

const getReadyIndicator = () =>
    document.getElementById('lightdash-ready-indicator');

const renderPage = () => {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });
    const page = (
        <QueryClientProvider client={client}>
            <MantineProvider env="test">
                <MinimalSavedExplorer savedQueryUuid="chart-uuid" />
            </MantineProvider>
        </QueryClientProvider>
    );
    const result = render(page);
    return {
        ...result,
        refresh: () =>
            result.rerender(
                <QueryClientProvider client={client}>
                    <MantineProvider env="test">
                        <MinimalSavedExplorer savedQueryUuid="chart-uuid" />
                    </MantineProvider>
                </QueryClientProvider>,
            ),
    };
};

const getResultsData = () =>
    (mocks.visualization.mock.lastCall![0] as VisualizationProviderProps)
        .resultsData;

describe('MinimalSavedExplorer screenshot readiness', () => {
    beforeEach(() => {
        mocks.queryError = null;
        mocks.subtotalDimensions = null;
        mocks.rootQueryUuid = 'query-uuid';
        mocks.isPreviousData = false;
        mocks.visualization.mockClear();
        mocks.executeSubtotal.mockReset();
        mocks.savedChart = mockSavedChartResponse({
            chartConfig: {
                type: ChartType.DATA_APP_VIZ,
                config: {
                    dataAppVizUuid: '22222222-2222-4222-8222-222222222222',
                    fieldMapping: {},
                },
            },
        });
    });

    it('exposes hierarchy expansion on the standalone minimal surface and caches children', async () => {
        mocks.subtotalDimensions = ['orders_country', 'orders_city'];
        const rows = [
            { orders_city: { value: { raw: 'Porto', formatted: 'Porto' } } },
        ];
        mocks.executeSubtotal.mockResolvedValue(rows);
        renderPage();
        await screen.findByTestId('signal-screenshot-ready');

        const subtotals = getResultsData().vizSubtotals;
        expect(subtotals?.dimensions).toEqual(mocks.subtotalDimensions);
        const intent = { level: 1, parentValues: ['Portugal'] };
        await expect(subtotals!.get(intent)).resolves.toEqual({ rows });
        await expect(subtotals!.get(intent)).resolves.toEqual({ rows });
        expect(mocks.executeSubtotal).toHaveBeenCalledTimes(1);
        expect(mocks.executeSubtotal).toHaveBeenCalledWith({
            projectUuid: 'project-uuid',
            chartUuid: 'chart-uuid',
            pivotResults: true,
            subtotalLevel: {
                subtotalDimensions: ['orders_city'],
                parent: [{ dimensionId: 'orders_country', value: 'Portugal' }],
            },
        });
    });

    it('rejects children if the root changes during expansion', async () => {
        mocks.subtotalDimensions = ['orders_country', 'orders_city'];
        let resolveRows!: (rows: []) => void;
        mocks.executeSubtotal.mockImplementation(
            () =>
                new Promise<[]>((resolve) => {
                    resolveRows = resolve;
                }),
        );
        const page = renderPage();
        await screen.findByTestId('signal-screenshot-ready');
        const expansion = getResultsData().vizSubtotals!.get({
            level: 1,
            parentValues: [null],
        });
        mocks.rootQueryUuid = 'replacement-query';
        mocks.savedChart = { ...mocks.savedChart! };
        page.refresh();
        resolveRows([]);
        await expect(expansion).rejects.toThrow(
            'The chart query changed during subtotal expansion.',
        );
    });

    it('disables expansion while a previous root is being replaced', async () => {
        mocks.subtotalDimensions = ['orders_country', 'orders_city'];
        mocks.isPreviousData = true;
        renderPage();
        await screen.findByTestId('signal-screenshot-ready');
        expect(getResultsData().vizSubtotals).toBeUndefined();
        expect(getResultsData().rows).toEqual([]);
    });

    it('waits for a custom chart type paint signal before becoming ready', async () => {
        renderPage();

        await screen.findByTestId('signal-screenshot-ready');
        expect(getReadyIndicator()).toBeNull();

        fireEvent.click(screen.getByTestId('signal-screenshot-ready'));
        await waitFor(() => expect(getReadyIndicator()).not.toBeNull());
    });

    it('still waits for the existing Vega chart paint signal', async () => {
        mocks.savedChart = mockSavedChartResponse({
            chartConfig: { type: ChartType.CUSTOM },
        });
        renderPage();
        await screen.findByTestId('signal-screenshot-ready');
        expect(getReadyIndicator()).toBeNull();
        fireEvent.click(screen.getByTestId('signal-screenshot-ready'));
        await waitFor(() => expect(getReadyIndicator()).not.toBeNull());
    });

    it('keeps ordinary charts ready once their query is loaded', async () => {
        mocks.savedChart = mockSavedChartResponse();
        renderPage();

        await waitFor(() => expect(getReadyIndicator()).not.toBeNull());
        expect(getResultsData().vizSubtotals).toBeUndefined();
        expect(mocks.executeSubtotal).not.toHaveBeenCalled();
    });

    it('releases the ready indicator for a query error without a paint signal', async () => {
        mocks.queryError = new Error('query failed');
        renderPage();

        await waitFor(() => expect(getReadyIndicator()).not.toBeNull());
        expect(getReadyIndicator()).toHaveAttribute(
            'data-status',
            'completed-with-errors',
        );
        expect(getReadyIndicator()).toHaveAttribute('data-tiles-errored', '1');
        expect(getResultsData().error).toBe(mocks.queryError);
    });
});
