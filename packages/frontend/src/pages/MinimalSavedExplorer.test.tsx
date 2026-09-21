import { ChartType, type SavedChart } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockSavedChartResponse } from '../testing/savedChartResponse.mock';

const mocks = vi.hoisted(() => ({
    savedChart: undefined as SavedChart | undefined,
    queryError: null as Error | null,
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
            error: mocks.queryError,
            data: {
                queryUuid: 'query-uuid',
                metricQuery: {},
                fields: {},
            },
        },
        queryResults: {
            isFetchingRows: false,
            queryUuid: 'query-uuid',
            error: mocks.queryError,
        },
        explore: undefined,
    }),
}));
vi.mock('../providers/App/useApp', () => ({
    default: () => ({ health: { isInitialLoading: false, data: {} } }),
}));
vi.mock('../components/MetricQueryData/MetricQueryDataProvider', () => ({
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../components/LightdashVisualization/VisualizationProvider', () => ({
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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

const renderPage = () =>
    render(
        <MantineProvider env="test">
            <MinimalSavedExplorer savedQueryUuid="chart-uuid" />
        </MantineProvider>,
    );

describe('MinimalSavedExplorer screenshot readiness', () => {
    beforeEach(() => {
        mocks.queryError = null;
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

    it('waits for a custom chart type paint signal before becoming ready', async () => {
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
    });

    it('releases the ready indicator for a query error without a paint signal', async () => {
        mocks.queryError = new Error('query failed');
        renderPage();

        await waitFor(() => expect(getReadyIndicator()).not.toBeNull());
        expect(getReadyIndicator()).toHaveAttribute(
            'data-status',
            'completed-with-errors',
        );
    });
});
