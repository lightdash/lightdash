import { ChartType } from '@lightdash/common';
import type * as MantineHooks from '@mantine/hooks';
import { act, screen } from '@testing-library/react';
import { type ReactNode } from 'react';
import type * as ReactRouter from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../testing/testUtils';

const mocks = vi.hoisted(() => ({
    projectUuid: '00000000-0000-4000-8000-000000000001',
    savedChartUuid: '00000000-0000-4000-8000-000000000002',
    visualizationProps: null as { onScreenshotReady?: () => void } | null,
    savedChart: {
        uuid: '00000000-0000-4000-8000-000000000002',
        tableName: 'orders',
        chartConfig: { type: 'data_app_viz' },
        tableConfig: { columnOrder: [] },
        metricQuery: { exploreName: 'orders', filters: {} },
    },
}));

vi.mock('react-router', async (importOriginal) => ({
    ...(await importOriginal<typeof ReactRouter>()),
    useParams: () => ({
        projectUuid: mocks.projectUuid,
        savedQueryUuid: mocks.savedChartUuid,
    }),
}));
vi.mock('react-redux', () => ({
    Provider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@mantine/hooks', async (importOriginal) => ({
    ...(await importOriginal<typeof MantineHooks>()),
    useSessionStorage: () => [undefined],
}));
vi.mock('../hooks/useProjectUuid', () => ({
    useProjectUuid: () => mocks.projectUuid,
}));
vi.mock('../hooks/useProjects', () => ({
    useProjects: () => ({ isError: false, isInitialLoading: false }),
}));
vi.mock('../hooks/useProject', () => ({
    useProject: () => ({
        data: { projectUuid: mocks.projectUuid, slug: 'project' },
        isError: false,
    }),
}));
vi.mock('../utils/projectUrl', () => ({
    getProjectUrlIdentifier: () => mocks.projectUuid,
}));
vi.mock('../hooks/useSavedQuery', () => ({
    useSavedQuery: () => ({
        data: mocks.savedChart,
        isInitialLoading: false,
        isError: false,
    }),
}));
vi.mock('../hooks/useSearchParams', () => ({ default: () => undefined }));
vi.mock('../features/scheduler/hooks/useScheduler', () => ({
    useScheduler: () => ({ data: undefined, isInitialLoading: false }),
}));
vi.mock('../providers/App/useApp', () => ({
    default: () => ({
        health: { isInitialLoading: false, data: { rudder: {} } },
    }),
}));
vi.mock('../features/explorer/store', () => ({
    buildInitialExplorerState: () => ({}),
    createExplorerStore: () => ({ dispatch: vi.fn() }),
    explorerActions: { reset: () => ({ type: 'reset' }) },
    selectSavedChart: () => mocks.savedChart,
    useExplorerSelector: () => mocks.savedChart,
}));
vi.mock('../hooks/useExplorerQueryEffects', () => ({
    useExplorerQueryEffects: () => undefined,
}));
vi.mock('../hooks/useExplorerQuery', () => ({
    useExplorerQuery: () => ({
        query: {
            data: { queryUuid: 'query-uuid', metricQuery: {}, fields: [] },
            isFetching: false,
            error: null,
        },
        queryResults: {
            queryUuid: 'query-uuid',
            rows: [],
            isFetchingRows: false,
            error: null,
        },
        explore: {},
    }),
}));
vi.mock('../hooks/useResizeObserver', () => ({
    useResizeObserver: () => [vi.fn(), { width: 800, height: 500 }],
}));
vi.mock('../components/MetricQueryData/MetricQueryDataProvider', () => ({
    default: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../components/LightdashVisualization/VisualizationProvider', () => ({
    default: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../components/LightdashVisualization', () => ({
    default: (props: { onScreenshotReady?: () => void }) => {
        mocks.visualizationProps = props;
        return <div data-testid="visualization" />;
    },
}));
vi.mock('../components/MetricQueryData/UnderlyingDataModal', () => ({
    default: () => null,
}));
vi.mock('../components/common/ScreenshotProgressIndicator', () => ({
    default: () => null,
}));
vi.mock('../components/common/ScreenshotReadyIndicator', () => ({
    default: () => <div data-testid="screenshot-ready" />,
}));

// eslint-disable-next-line import/first
import MinimalSavedExplorer from './MinimalSavedExplorer';

describe('MinimalSavedExplorer custom chart type screenshot readiness', () => {
    beforeEach(() => {
        mocks.visualizationProps = null;
    });

    it.each([ChartType.DATA_APP_VIZ, ChartType.CUSTOM])(
        'waits for a %s paint signal before marking the page ready',
        (chartType) => {
            mocks.savedChart.chartConfig.type = chartType;
            renderWithProviders(<MinimalSavedExplorer />);

            expect(screen.queryByTestId('screenshot-ready')).toBeNull();
            expect(mocks.visualizationProps?.onScreenshotReady).toBeDefined();

            act(() => mocks.visualizationProps?.onScreenshotReady?.());

            expect(screen.getByTestId('screenshot-ready')).not.toBeNull();
        },
    );

    it('does not wait for a separate paint signal for an ordinary chart', () => {
        mocks.savedChart.chartConfig.type = ChartType.CARTESIAN;
        renderWithProviders(<MinimalSavedExplorer />);

        expect(screen.getByTestId('screenshot-ready')).not.toBeNull();
        expect(mocks.visualizationProps?.onScreenshotReady).toBeDefined();
    });
});
