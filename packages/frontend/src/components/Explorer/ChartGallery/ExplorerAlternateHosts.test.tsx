import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createPortal } from 'react-dom';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import EmbedExplore from '../../../ee/features/embed/EmbedExplore/components/EmbedExplore';
import { explorerActions } from '../../../features/explorer/store';
import { type InfiniteQueryResults } from '../../../hooks/useQueryResults';
import { renderWithProviders } from '../../../testing/testUtils';
import DashboardChartEditorModal from '../../DashboardTiles/DashboardChartEditorModal';

vi.mock('../../MonacoEditor', () => ({ default: () => null }));

vi.mock('../VisualizationCard/VisualizationConfig', async () => {
    const { ConfigTabs } =
        await import('../../VisualizationConfigs/ChartConfigPanel/ConfigTabs');

    return { default: ConfigTabs };
});

vi.mock('../index', async () => {
    const { ChartType } = await import('@lightdash/common');
    const {
        selectIsVisualizationConfigOpen,
        useExplorerDispatch,
        useExplorerSelector,
    } = await import('../../../features/explorer/store');
    const { default: ChartColorMappingContextProvider } =
        await import('../../../hooks/useChartColorConfig/ChartColorMappingContextProvider');
    const { default: VisualizationProvider } =
        await import('../../LightdashVisualization/VisualizationProvider');
    const { default: ExplorerChartSidebar } =
        await import('./ExplorerChartSidebar');
    const { default: useVisualizationConfigPortalTarget } =
        await import('../VisualizationCard/useVisualizationConfigPortalTarget');
    const resultsData: InfiniteQueryResults & {
        fields: Record<string, never>;
    } = {
        rows: [],
        fields: {},
        isInitialLoading: false,
        isFetchingFirstPage: false,
        isFetchingRows: false,
        isFetchingAllPages: false,
        fetchMoreRows: () => undefined,
        refetchRows: async () => undefined,
        setFetchAll: () => undefined,
        fetchAll: false,
        hasFetchedAllRows: true,
        totalClientFetchTimeMs: undefined,
        error: null,
    };

    const ExplorerHostProbe = () => {
        const dispatch = useExplorerDispatch();
        const isOpen = useExplorerSelector(selectIsVisualizationConfigOpen);
        const target = useVisualizationConfigPortalTarget(isOpen);

        return (
            <ChartColorMappingContextProvider>
                <VisualizationProvider
                    chartConfig={{
                        type: ChartType.CARTESIAN,
                        config: {
                            layout: { xField: '', yField: [] },
                            eChartsConfig: { series: [] },
                        },
                    }}
                    initialPivotDimensions={undefined}
                    resultsData={resultsData}
                    isLoading={false}
                    columnOrder={[]}
                    colorPalette={[]}
                    isEditMode
                >
                    <button
                        type="button"
                        onClick={() =>
                            dispatch(explorerActions.openVisualizationConfig())
                        }
                    >
                        Configure
                    </button>
                    {target &&
                        createPortal(
                            <ExplorerChartSidebar
                                chartType={ChartType.CARTESIAN}
                                onClose={() =>
                                    dispatch(
                                        explorerActions.closeVisualizationConfig(),
                                    )
                                }
                            />,
                            target,
                        )}
                </VisualizationProvider>
            </ChartColorMappingContextProvider>
        );
    };

    return { default: ExplorerHostProbe };
});

vi.mock('../ExploreSideBar', () => ({
    default: ({
        onExploreClick,
    }: {
        onExploreClick?: (explore: { name: string }) => void;
    }) => (
        <button
            type="button"
            onClick={() => onExploreClick?.({ name: 'orders' })}
        >
            Orders
        </button>
    ),
}));

vi.mock('../../../hooks/useExplore', () => ({
    useExplore: () => ({ data: undefined, error: null }),
}));

vi.mock('../../../hooks/useExplorerQueryEffects', () => ({
    useExplorerQueryEffects: vi.fn(),
}));

vi.mock('../../../hooks/dashboard/useDashboardCustomMetricSeed', () => ({
    useDashboardCustomMetricSeed: () => ({
        seededMetrics: [],
        dashboardMetricIds: new Set(),
        isLoading: false,
    }),
}));

vi.mock('../../../hooks/dashboard/useUpdateDashboardCustomMetric', () => ({
    useDeleteDashboardCustomMetric: () => ({
        mutate: vi.fn(),
        isLoading: false,
    }),
}));

vi.mock('../../../hooks/toaster/useToaster', () => ({
    default: () => ({
        showToastSuccess: vi.fn(),
        showToastError: vi.fn(),
    }),
}));

vi.mock('../../../ee/providers/Embed/useEmbed', () => ({
    default: () => ({ projectUuid: 'project-uuid' }),
}));

describe('Explorer chart configuration in alternate hosts', () => {
    it('opens the chart gallery and settings in the dashboard chart editor', async () => {
        const user = userEvent.setup();

        renderWithProviders(
            <MemoryRouter>
                <DashboardChartEditorModal
                    opened
                    dashboardUuid="dashboard-uuid"
                    dashboardName="Orders dashboard"
                    customMetricsEnabled={false}
                    onChartSaved={vi.fn()}
                    onRegistryMetricEdited={vi.fn()}
                    onRegistryMetricDeleted={vi.fn()}
                    onClose={vi.fn()}
                />
            </MemoryRouter>,
        );

        await user.click(screen.getByRole('button', { name: 'Orders' }));
        expect(
            document.getElementById('visualization-config-portal'),
        ).not.toBeNull();
        await user.click(screen.getByRole('button', { name: 'Configure' }));

        expect(screen.getByText('Configure chart')).toBeVisible();
        expect(screen.getByRole('tab', { name: 'Layout' })).toBeVisible();

        await user.click(screen.getByRole('button', { name: 'Change' }));

        expect(screen.getByText('Choose chart type')).toBeVisible();
        expect(screen.getByRole('button', { name: 'Bar chart' })).toBeVisible();
    });

    it('opens the chart gallery and settings in Embed Explore', async () => {
        const user = userEvent.setup();

        renderWithProviders(
            <MemoryRouter>
                <EmbedExplore exploreId="orders" />
            </MemoryRouter>,
        );

        await user.click(screen.getByRole('button', { name: 'Configure' }));

        expect(screen.getByText('Configure chart')).toBeVisible();
        expect(screen.getByRole('tab', { name: 'Layout' })).toBeVisible();

        await user.click(screen.getByRole('button', { name: 'Change' }));

        expect(screen.getByText('Choose chart type')).toBeVisible();
        expect(screen.getByRole('button', { name: 'Bar chart' })).toBeVisible();
    });
});
