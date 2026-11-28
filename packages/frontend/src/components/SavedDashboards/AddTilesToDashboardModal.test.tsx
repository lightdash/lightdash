import { DashboardTileTypes } from '@lightdash/common';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { renderWithProviders } from '../../testing/testUtils';
import AddTilesToDashboardModal from './AddTilesToDashboardModal';

const mocks = vi.hoisted(() => ({ updateDashboard: vi.fn() }));
vi.mock('../../features/composerCharts/hooks/useComposerChartRun', () => ({
    useComposerChart: (_: string, uuid: string | null) => ({
        isSuccess: uuid !== null,
        data: {
            uuid,
            name: 'Orders by status',
            space: { uuid: 'space', name: 'Finance' },
            chart: { chartConfig: { type: 'cartesian' } },
        },
    }),
}));
vi.mock('../../hooks/useSavedQuery', () => ({
    useSavedQuery: () => ({ isSuccess: false }),
}));
vi.mock('../../features/sqlRunner/hooks/useSavedSqlCharts', () => ({
    useSavedSqlChart: () => ({ isSuccess: false }),
}));
vi.mock('../../hooks/dashboard/useDashboards', () => ({
    useDashboards: () => ({
        data: [{ uuid: 'dashboard', name: 'Sales', spaceUuid: 'space' }],
        isInitialLoading: false,
    }),
}));
vi.mock('../../hooks/useSpaces', () => ({
    useSpaceSummaries: () => ({
        data: [{ uuid: 'space', name: 'Finance' }],
        isInitialLoading: false,
    }),
    useCreateMutation: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('../../hooks/dashboard/useDashboard', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useDashboardQuery: ({ uuidOrSlug }: { uuidOrSlug: string }) => ({
        data: uuidOrSlug
            ? {
                  uuid: 'dashboard',
                  slug: 'sales',
                  name: 'Sales',
                  filters: {
                      dimensions: [],
                      metrics: [],
                      tableCalculations: [],
                  },
                  tiles: [],
                  tabs: [],
              }
            : undefined,
        isFetching: false,
        isError: false,
    }),
    useCreateMutation: () => ({ mutateAsync: vi.fn() }),
    useUpdateDashboard: () => ({ mutateAsync: mocks.updateDashboard }),
}));

it('adds a composer chart to a dashboard as a composer tile', async () => {
    renderWithProviders(
        <MemoryRouter>
            <AddTilesToDashboardModal
                isOpen
                projectUuid="project"
                uuid="composer-chart"
                dashboardTileType={DashboardTileTypes.COMPOSER_CHART}
            />
        </MemoryRouter>,
    );
    const add = await screen.findByRole('button', { name: 'Add to dashboard' });
    await waitFor(() => expect(add).toBeEnabled());
    fireEvent.click(add);
    await waitFor(() =>
        expect(mocks.updateDashboard).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                tiles: [
                    expect.objectContaining({
                        type: DashboardTileTypes.COMPOSER_CHART,
                        properties: {
                            composerChartUuid: 'composer-chart',
                            chartName: 'Orders by status',
                        },
                    }),
                ],
            }),
        ),
    );
});
