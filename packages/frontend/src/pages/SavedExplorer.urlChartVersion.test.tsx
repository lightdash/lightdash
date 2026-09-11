import { ChartType, type SavedChart } from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../api';
import { renderWithProviders } from '../testing/testUtils';
import SavedExplorer from './SavedExplorer';

vi.mock('../api', () => ({ lightdashApi: vi.fn() }));

// The Explorer is out of scope; the probe reports what the session started on.
vi.mock('../components/Explorer', async () => {
    const {
        explorerActions,
        selectHasUnsavedChanges,
        selectUnsavedChartVersion,
        selectUnsavedColorPaletteUuid,
        useExplorerDispatch,
        useExplorerSelector,
    } = await import('../features/explorer/store');
    const { useLocation, useNavigate } = await import('react-router');
    const StoreProbe = () => {
        const dispatch = useExplorerDispatch();
        const navigate = useNavigate();
        const { search } = useLocation();
        const unsavedChartVersion = useExplorerSelector(
            selectUnsavedChartVersion,
        );
        const hasUnsavedChanges = useExplorerSelector(selectHasUnsavedChanges);
        const paletteUuid = useExplorerSelector(selectUnsavedColorPaletteUuid);
        return (
            <div>
                <div data-testid="session">
                    {unsavedChartVersion.metricQuery.limit}|
                    {String(hasUnsavedChanges)}|{paletteUuid}
                </div>
                <button
                    type="button"
                    onClick={() =>
                        dispatch(
                            explorerActions.setColorPaletteUuid(
                                'staged-palette',
                            ),
                        )
                    }
                >
                    stage palette
                </button>
                <button
                    type="button"
                    onClick={() =>
                        navigate(
                            { search: `${search}&other=1` },
                            { replace: true },
                        )
                    }
                >
                    write another param
                </button>
            </div>
        );
    };
    return { default: StoreProbe };
});

vi.mock('../components/Explorer/SavedChartsHeader', () => ({
    default: () => null,
}));
vi.mock('../components/Explorer/ExplorePanel', () => ({ default: () => null }));
vi.mock(
    '../components/Explorer/ChartGallery/useChartGalleryRightSidebar',
    () => ({
        useChartGalleryRightSidebar: () => ({}),
    }),
);
vi.mock('../hooks/useExplorerQueryEffects', () => ({
    useExplorerQueryEffects: vi.fn(),
}));
vi.mock('../hooks/useRecordContentView', () => ({
    useRecordContentView: vi.fn(),
}));
vi.mock('../hooks/useProjectRoute', () => ({
    useOptionalProjectRoute: () => undefined,
    useProjectUrlIdentifier: () => '9a0b7a3c-0000-4000-8000-000000000001',
}));
vi.mock('../ee/providers/Embed/useEmbed', () => ({
    default: () => ({ projectUuid: undefined }),
}));

const PROJECT_UUID = '9a0b7a3c-0000-4000-8000-000000000001';

const savedChart = {
    uuid: 'chart-uuid',
    slug: 'revenue-per-payment-method',
    projectUuid: PROJECT_UUID,
    organizationUuid: '172a2270-000f-42be-9c68-c4752c23ae51',
    name: 'Revenue per payment method',
    tableName: 'payments',
    metricQuery: {
        exploreName: 'payments',
        dimensions: ['payments_payment_method'],
        metrics: ['payments_total_revenue'],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [],
        additionalMetrics: [],
    },
    chartConfig: {
        type: ChartType.CARTESIAN,
        config: { layout: {}, eChartsConfig: {} },
    },
    tableConfig: { columnOrder: [] },
    dashboardUuid: null,
    dashboardName: null,
} as unknown as SavedChart;

const urlChartVersion = {
    tableName: 'payments',
    metricQuery: { ...savedChart.metricQuery, limit: 25 },
    chartConfig: savedChart.chartConfig,
    tableConfig: savedChart.tableConfig,
};

const renderSavedExplorer = (search: string, mode: 'edit' | 'view') => {
    const path = `/projects/${PROJECT_UUID}/saved/${savedChart.slug}/${mode}${search}`;
    renderWithProviders(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route
                    path="/projects/:projectUuid/saved/:savedQueryUuid/:mode"
                    element={<SavedExplorer />}
                />
            </Routes>
        </MemoryRouter>,
    );
};

const searchWithChartVersion = (payload: unknown) =>
    `?create_saved_chart_version=${encodeURIComponent(
        JSON.stringify(payload),
    )}&fromDashboard=dashboard-uuid`;

describe('SavedExplorer with an unsaved chart version in the url', () => {
    beforeEach(() => {
        vi.mocked(lightdashApi).mockImplementation((async ({ url, method }) => {
            if (
                method === 'GET' &&
                typeof url === 'string' &&
                url.includes('/saved/')
            ) {
                return savedChart;
            }
            return new Promise(() => {});
        }) as typeof lightdashApi);
    });

    it('starts the edit session on the version the url carries', async () => {
        renderSavedExplorer(searchWithChartVersion(urlChartVersion), 'edit');

        await waitFor(() =>
            expect(screen.getByTestId('session')).toHaveTextContent('25|true'),
        );
    });

    it('ignores the param in view mode', async () => {
        renderSavedExplorer(searchWithChartVersion(urlChartVersion), 'view');

        await waitFor(() =>
            expect(screen.getByTestId('session')).toHaveTextContent(
                '500|false',
            ),
        );
    });

    it('falls back to the saved chart when the param is malformed', async () => {
        renderSavedExplorer(
            '?create_saved_chart_version=not-json&fromDashboard=dashboard-uuid',
            'edit',
        );

        await waitFor(() =>
            expect(screen.getByTestId('session')).toHaveTextContent(
                '500|false',
            ),
        );
    });

    it('keeps a staged palette when another search param is written', async () => {
        const user = userEvent.setup();
        renderSavedExplorer(searchWithChartVersion(urlChartVersion), 'edit');
        await waitFor(() =>
            expect(screen.getByTestId('session')).toHaveTextContent('25|true'),
        );

        await user.click(screen.getByText('stage palette'));
        expect(screen.getByTestId('session')).toHaveTextContent(
            'staged-palette',
        );

        // The merge provider and the deep-link cleanup write to the same
        // search; a write that leaves the version alone must not reset the session
        await user.click(screen.getByText('write another param'));

        expect(screen.getByTestId('session')).toHaveTextContent(
            '25|true|staged-palette',
        );
    });
});
