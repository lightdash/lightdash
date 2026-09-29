import { Ability } from '@casl/ability';
import {
    DashboardTileTypes,
    type CreateSavedChartVersion,
    type DashboardChartTile,
    type PossibleAbilities,
} from '@lightdash/common';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../api';
import { DashboardChartEditorActionsPortalId } from '../components/DashboardTiles/constants';
import { AbilityContext } from '../providers/Ability/context';
import {
    manageChartRule,
    mockSavedChartResponse,
} from '../testing/savedChartResponse.mock';
import { renderWithProviders } from '../testing/testUtils';

const PROJECT_UUID = 'project-uuid';
const DASHBOARD_UUID = 'dashboard-uuid';

const editChart = mockSavedChartResponse();

const copiedTile: DashboardChartTile = {
    uuid: 'copy-tile',
    type: DashboardTileTypes.SAVED_CHART,
    x: 0,
    y: 0,
    w: 6,
    h: 6,
    tabUuid: undefined,
    properties: { savedChartUuid: editChart.uuid, belongsToDashboard: true },
};

const state = vi.hoisted(() => ({
    chartEditorEnabled: true,
    haveTilesChanged: false,
    verified: false,
}));

vi.mock('../api', () => ({ lightdashApi: vi.fn() }));
vi.mock('../hooks/useContentAuthoringEnabled', () => ({
    useContentAuthoringEnabled: () => true,
}));

// The dashboard's own data layer is not under test: a fixed context stands in
// for the provider so the page renders straight to the chart editor.
vi.mock('../providers/Dashboard/DashboardProvider', () => ({
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../providers/Dashboard/DashboardAiAgentContextBridge', () => ({
    default: () => null,
}));

vi.mock('../providers/Dashboard/useDashboardContext', async () => {
    const dashboardContext = {
        isDashboardLoading: false,
        dashboard: {
            uuid: 'dashboard-uuid',
            name: 'Payments',
            slug: 'payments',
            projectUuid: 'project-uuid',
            tiles: [],
            filters: { dimensions: [], metrics: [], tableCalculations: [] },
            tabs: [],
            config: {},
            get verification() {
                return state.verified
                    ? { verifiedBy: { userUuid: 'other-user' } }
                    : undefined;
            },
        },
        dashboardError: undefined,
        dashboardFilters: {
            dimensions: [],
            metrics: [],
            tableCalculations: [],
        },
        dashboardTemporaryFilters: {
            dimensions: [],
            metrics: [],
            tableCalculations: [],
        },
        get dashboardTiles() {
            return [copiedTile];
        },
        dashboardTabs: [],
        dashboardCustomMetrics: [],
        dashboardParameters: {},
        dashboardParameterReferences: new Set<string>(),
        parameterDefinitions: {},
        parameterValues: {},
        parameterOrder: [],
        pinnedParameters: [],
        missingRequiredParameters: [],
        dateZoomGranularities: [],
        defaultDateZoomGranularity: undefined,
        dateZoomConfig: { controls: [], tileTargets: {} },
        activeTab: undefined,
        get haveTilesChanged() {
            return state.haveTilesChanged;
        },
        haveFiltersChanged: false,
        haveTabsChanged: false,
        haveCustomMetricsChanged: false,
        havePinnedParametersChanged: false,
        haveDateZoomGranularitiesChanged: false,
        hasParameterOrderChanged: false,
        hasDefaultDateZoomGranularityChanged: false,
        hasDateZoomConfigChanged: false,
        parametersHaveChanged: false,
        hasTilesThatSupportFilters: false,
        isDateZoomDisabled: false,
        isAddFilterDisabled: false,
        requiredFiltersNote: undefined,
        setDashboardTiles: vi.fn(),
        setDashboardTabs: vi.fn(),
        setDashboardFilters: vi.fn(),
        setDashboardTemporaryFilters: vi.fn(),
        setDashboardCustomMetrics: vi.fn(),
        setHaveTilesChanged: vi.fn(),
        setHaveFiltersChanged: vi.fn(),
        setHaveTabsChanged: vi.fn(),
        setHaveCustomMetricsChanged: vi.fn(),
        setHavePinnedParametersChanged: vi.fn(),
        setHaveDateZoomGranularitiesChanged: vi.fn(),
        setHasParameterOrderChanged: vi.fn(),
        setHasDefaultDateZoomGranularityChanged: vi.fn(),
        setHasDateZoomConfigChanged: vi.fn(),
        setDateZoomConfig: vi.fn(),
        setDateZoomGranularities: vi.fn(),
        setDefaultDateZoomGranularity: vi.fn(),
        setActiveTab: vi.fn(),
        setParameter: vi.fn(),
        setParameterOrder: vi.fn(),
        setPinnedParameters: vi.fn(),
        setSavedParameters: vi.fn(),
        setRequiredFiltersNote: vi.fn(),
        toggleParameterPin: vi.fn(),
        clearAllParameters: vi.fn(),
        resetDashboardFilters: vi.fn(),
        refreshDashboardVersion: vi.fn(),
    };
    return {
        default: <T,>(selector: (context: typeof dashboardContext) => T) =>
            selector(dashboardContext),
    };
});

vi.mock('../providers/Dashboard/useDashboardTileStatusContext', () => {
    const tileStatusContext = {
        areAllChartsLoaded: true,
        oldestCacheTime: undefined,
        preAggregateStatuses: [],
    };
    return {
        default: <T,>(selector: (context: typeof tileStatusContext) => T) =>
            selector(tileStatusContext),
    };
});

vi.mock('../components/common/Dashboard/DashboardHeader', () => ({
    default: () => null,
}));

vi.mock('../features/dashboardTabs', async () => {
    const { Menu, Button } = await import('@mantine/core');
    const { default: EditChartMenuItem } =
        await import('../components/DashboardTiles/EditChartMenuItem');
    return {
        default: () => (
            <Menu>
                <Menu.Target>
                    <Button>Tile actions</Button>
                </Menu.Target>
                <Menu.Dropdown>
                    <EditChartMenuItem
                        tile={copiedTile}
                        chart={editChart}
                        chartSlug={editChart.slug}
                    />
                </Menu.Dropdown>
            </Menu>
        ),
    };
});

vi.mock('../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        data: { enabled: state.chartEditorEnabled },
    }),
}));

vi.mock('../features/contentAsCode/hooks/useContentDrafts', () => ({
    useReopenDraftMutation: () => ({ mutate: vi.fn(), isLoading: false }),
    useRebaseDraftMutation: () => ({ mutate: vi.fn(), isLoading: false }),
    useDraftStaleness: () => ({ data: undefined }),
}));

vi.mock('../features/comments', () => ({
    useDashboardCommentsCheck: () => ({
        userCanViewDashboardComments: false,
        userCanManageDashboardComments: false,
    }),
}));

vi.mock('../hooks/organization/useOrganization', () => ({
    useOrganization: () => ({ data: undefined }),
}));

vi.mock('../hooks/useContent', () => ({
    useContentAction: () => ({ mutateAsync: vi.fn(), isLoading: false }),
}));

vi.mock('../hooks/useRecordContentView', () => ({
    useRecordContentView: vi.fn(),
}));

vi.mock('../providers/Fullscreen/useNativeFullscreenToggle', () => ({
    default: () => ({ isFullscreen: false, toggleFullscreen: vi.fn() }),
}));

vi.mock('../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-uuid',
}));

vi.mock('../hooks/useProjectRoute', () => ({
    useOptionalProjectRoute: () => undefined,
    useProjectUrlIdentifier: () => 'project-uuid',
}));

// The Explorer is out of scope; a probe exposes the modal store's draft.
vi.mock('../components/Explorer', async () => {
    const {
        explorerActions,
        selectUnsavedChartVersion,
        useExplorerDispatch,
        useExplorerSelector,
    } = await import('../features/explorer/store');
    const StoreProbe = () => {
        const unsavedChartVersion = useExplorerSelector(
            selectUnsavedChartVersion,
        );
        const dispatch = useExplorerDispatch();
        return (
            <div>
                <div data-testid="store-limit">
                    {unsavedChartVersion.metricQuery.limit}
                </div>
                <button
                    type="button"
                    onClick={() => dispatch(explorerActions.setRowLimit(25))}
                >
                    Edit the query
                </button>
            </div>
        );
    };
    return { default: StoreProbe };
});

vi.mock('../components/Explorer/ExploreSideBar', () => ({
    default: () => null,
}));

vi.mock('../hooks/useExplore', () => ({
    useExplore: () => ({ data: undefined, error: null }),
    useExploreByProjectUuid: () => ({ data: undefined, error: null }),
}));

vi.mock('../hooks/useExplorerQueryEffects', () => ({
    useExplorerQueryEffects: vi.fn(),
}));

vi.mock('../hooks/dashboard/useDashboardCustomMetricSeed', () => ({
    useDashboardCustomMetricSeed: () => ({
        seededMetrics: [],
        dashboardMetricIds: new Set(),
        isLoading: false,
    }),
}));

vi.mock('../hooks/dashboard/useUpdateDashboardCustomMetric', () => ({
    useDeleteDashboardCustomMetric: () => ({
        mutate: vi.fn(),
        isLoading: false,
    }),
}));

vi.mock('../hooks/toaster/useToaster', () => ({
    default: () => ({
        showToastSuccess: vi.fn(),
        showToastError: vi.fn(),
        showToastApiError: vi.fn(),
        showToastInfo: vi.fn(),
    }),
}));

vi.mock('../ee/providers/Embed/useEmbed', () => ({
    default: () => ({ projectUuid: 'project-uuid' }),
}));

vi.mock(
    '../ee/features/aiCopilot/components/AskAiAgentMenuItem/AskAiAgentMenuItem',
    () => ({ AskAiAgentMenuItem: () => null }),
);

// eslint-disable-next-line import/first
import DashboardPage from './Dashboard';

const manageChartAbility = new Ability<PossibleAbilities>([
    manageChartRule,
    { action: 'manage', subject: 'Explore' },
]);

const UrlProbe = () => {
    const location = useLocation();
    return (
        <div data-testid="url" data-pathname={location.pathname}>
            {location.search}
        </div>
    );
};

const renderDashboard = (search: string) => {
    const router = createMemoryRouter(
        [
            {
                path: '/projects/:projectUuid/dashboards/:dashboardUuid/:mode?',
                element: (
                    <>
                        <UrlProbe />
                        <DashboardPage />
                    </>
                ),
            },
            {
                path: '/projects/:projectUuid/saved/:chartSlug/edit',
                element: <UrlProbe />,
            },
        ],
        {
            initialEntries: [
                `/projects/${PROJECT_UUID}/dashboards/${DASHBOARD_UUID}${search}`,
            ],
        },
    );
    renderWithProviders(
        <AbilityContext.Provider value={manageChartAbility}>
            <RouterProvider router={router} />
        </AbilityContext.Provider>,
        { user: { abilityRules: manageChartAbility.rules } },
    );
};

const editedVersion: CreateSavedChartVersion = {
    tableName: 'payments',
    metricQuery: { ...editChart.metricQuery, limit: 25 },
    chartConfig: editChart.chartConfig,
    tableConfig: editChart.tableConfig,
};

const withBothParams = (version: string) =>
    `?editChart=chart-uuid&create_saved_chart_version=${encodeURIComponent(
        version,
    )}`;

const urlParams = () =>
    new URLSearchParams(screen.getByTestId('url').textContent ?? '');

describe('Dashboard in-dashboard chart editor url', () => {
    beforeEach(() => {
        state.chartEditorEnabled = true;
        state.haveTilesChanged = false;
        state.verified = false;
        sessionStorage.clear();
        vi.mocked(lightdashApi).mockClear();
        vi.mocked(lightdashApi).mockImplementation((async ({ url, method }) => {
            if (
                method === 'GET' &&
                url.startsWith(`/projects/${PROJECT_UUID}/saved/chart-uuid`)
            ) {
                return editChart;
            }
            return new Promise(() => {});
        }) as typeof lightdashApi);
    });

    it('offers to save dashboard edits before navigating to the chart editor and can cancel', async () => {
        state.chartEditorEnabled = false;
        state.haveTilesChanged = true;
        renderDashboard('/edit');
        await userEvent.click(
            screen.getByRole('button', { name: 'Tile actions' }),
        );
        await userEvent.click(
            screen.getByRole('menuitem', { name: 'Edit chart' }),
        );
        expect(
            await screen.findByText(
                'You have unsaved dashboard changes. These will be saved before opening the chart editor.',
            ),
        ).toBeVisible();
        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        await waitFor(() =>
            expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
        );
        expect(
            vi
                .mocked(lightdashApi)
                .mock.calls.some(([request]) => request.method === 'PATCH'),
        ).toBe(false);
        expect(
            sessionStorage.getItem('unsavedDashboardTiles:dashboard-uuid'),
        ).toBeNull();
    });

    it('keeps edits on save failure and opens the selected chart only after a successful retry', async () => {
        state.chartEditorEnabled = false;
        state.haveTilesChanged = true;
        let finishSave: (value: unknown) => void = () => {};
        let failSave: (reason: unknown) => void = () => {};
        const savedDashboard = {
            uuid: DASHBOARD_UUID,
            slug: 'payments',
            tiles: [],
            tabs: [],
        };
        vi.mocked(lightdashApi).mockImplementation((({ method }) => {
            if (method === 'PATCH') {
                return new Promise<unknown>((resolve, reject) => {
                    finishSave = resolve;
                    failSave = reject;
                });
            }
            return new Promise(() => {});
        }) as typeof lightdashApi);
        renderDashboard('/edit');
        await userEvent.click(
            screen.getByRole('button', { name: 'Tile actions' }),
        );
        await userEvent.click(
            screen.getByRole('menuitem', { name: 'Edit chart' }),
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Save and edit chart' }),
        );
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
        expect(screen.getByTestId('url')).toHaveAttribute(
            'data-pathname',
            `/projects/${PROJECT_UUID}/dashboards/${DASHBOARD_UUID}/edit`,
        );
        failSave({ error: { message: 'Save failed' } });
        await waitFor(() =>
            expect(
                screen.getByRole('button', { name: 'Save and edit chart' }),
            ).toBeEnabled(),
        );
        expect(screen.getByTestId('url')).toHaveAttribute(
            'data-pathname',
            `/projects/${PROJECT_UUID}/dashboards/${DASHBOARD_UUID}/edit`,
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Save and edit chart' }),
        );
        expect(lightdashApi).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'PATCH',
                body: expect.stringContaining('"tiles":[{"uuid":"copy-tile"'),
            }),
        );
        finishSave(savedDashboard);
        await waitFor(() =>
            expect(screen.getByTestId('url')).toHaveAttribute(
                'data-pathname',
                `/projects/${PROJECT_UUID}/saved/${editChart.slug}/edit`,
            ),
        );
        expect(urlParams().get('fromDashboard')).toBe(DASHBOARD_UUID);
    });

    it('keeps the verification choice before saving a verified dashboard', async () => {
        state.chartEditorEnabled = false;
        state.haveTilesChanged = true;
        state.verified = true;
        renderDashboard('/edit');
        await userEvent.click(
            screen.getByRole('button', { name: 'Tile actions' }),
        );
        await userEvent.click(
            screen.getByRole('menuitem', { name: 'Edit chart' }),
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Save and edit chart' }),
        );
        expect(
            await screen.findByText('Save verified dashboard'),
        ).toBeVisible();
        expect(
            vi
                .mocked(lightdashApi)
                .mock.calls.some(([request]) => request.method === 'PATCH'),
        ).toBe(false);
        await userEvent.click(
            screen.getByRole('button', { name: 'Save anyway' }),
        );
        await waitFor(() =>
            expect(lightdashApi).toHaveBeenCalledWith(
                expect.objectContaining({
                    method: 'PATCH',
                    body: expect.stringContaining(
                        '"preserveVerification":false',
                    ),
                }),
            ),
        );
    });

    it('opens the in-dashboard editor without saving staged dashboard edits', async () => {
        state.haveTilesChanged = true;
        renderDashboard('/edit');
        await userEvent.click(
            screen.getByRole('button', { name: 'Tile actions' }),
        );
        await userEvent.click(
            screen.getByRole('menuitem', { name: 'Edit chart' }),
        );
        expect(await screen.findByTestId('store-limit')).toBeVisible();
        expect(urlParams().get('editChart')).toBe(editChart.uuid);
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        expect(
            vi
                .mocked(lightdashApi)
                .mock.calls.some(([request]) => request.method === 'PATCH'),
        ).toBe(false);
    });

    it('navigates without prompting or saving when the dashboard is unchanged', async () => {
        state.chartEditorEnabled = false;
        renderDashboard('/edit');
        await userEvent.click(
            screen.getByRole('button', { name: 'Tile actions' }),
        );
        await userEvent.click(
            screen.getByRole('menuitem', { name: 'Edit chart' }),
        );
        await waitFor(() =>
            expect(screen.getByTestId('url')).toHaveAttribute(
                'data-pathname',
                `/projects/${PROJECT_UUID}/saved/${editChart.slug}/edit`,
            ),
        );
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        expect(
            vi
                .mocked(lightdashApi)
                .mock.calls.some(([request]) => request.method === 'PATCH'),
        ).toBe(false);
    });

    it('opens the editor on the edits carried in the url', async () => {
        renderDashboard(withBothParams(JSON.stringify(editedVersion)));
        expect(await screen.findByTestId('store-limit')).toHaveTextContent(
            '25',
        );
        // The url keeps carrying them.
        await waitFor(() =>
            expect(
                JSON.parse(
                    urlParams().get('create_saved_chart_version') ?? 'null',
                ),
            ).toMatchObject({ metricQuery: { limit: 25 } }),
        );
        expect(urlParams().get('editChart')).toBe('chart-uuid');
        // Re-stringifying what it was seeded with reproduces the param, so
        // opening does not rewrite the url.
        expect(urlParams().get('create_saved_chart_version')).toBe(
            JSON.stringify(editedVersion),
        );
    });

    it('falls back to the saved chart when the param is malformed', async () => {
        renderDashboard(
            '?editChart=chart-uuid&create_saved_chart_version=nope',
        );

        expect(await screen.findByTestId('store-limit')).toHaveTextContent(
            '500',
        );
    });

    it('falls back to the saved chart when the version is for another table', async () => {
        renderDashboard(
            withBothParams(
                JSON.stringify({ ...editedVersion, tableName: 'orders' }),
            ),
        );

        expect(await screen.findByTestId('store-limit')).toHaveTextContent(
            '500',
        );
    });

    it('falls back when the version query targets another explore', async () => {
        renderDashboard(
            withBothParams(
                JSON.stringify({
                    ...editedVersion,
                    metricQuery: {
                        ...editedVersion.metricQuery,
                        exploreName: 'orders',
                    },
                }),
            ),
        );

        expect(await screen.findByTestId('store-limit')).toHaveTextContent(
            '500',
        );
    });

    it('writes the edits into the url and clears both params on close', async () => {
        const user = userEvent.setup();
        renderDashboard('?editChart=chart-uuid');

        expect(await screen.findByTestId('store-limit')).toHaveTextContent(
            '500',
        );
        expect(urlParams().get('create_saved_chart_version')).toBeNull();

        await user.click(
            screen.getByRole('button', { name: 'Edit the query' }),
        );
        await waitFor(() =>
            expect(
                urlParams().get('create_saved_chart_version'),
            ).not.toBeNull(),
        );

        await user.click(
            within(
                document.getElementById(DashboardChartEditorActionsPortalId)!,
            ).getByRole('button', { name: 'Cancel' }),
        );
        await user.click(
            within(
                await screen.findByRole('dialog', { name: 'Unsaved changes' }),
            ).getByRole('button', { name: 'Discard changes' }),
        );

        await waitFor(() => expect(urlParams().get('editChart')).toBeNull());
        expect(urlParams().get('create_saved_chart_version')).toBeNull();
    });

    it('ignores both params when the editor is disabled', async () => {
        state.chartEditorEnabled = false;
        renderDashboard(withBothParams(JSON.stringify(editedVersion)));

        await waitFor(() =>
            expect(urlParams().get('editChart')).toBe('chart-uuid'),
        );
        expect(screen.queryByTestId('store-limit')).toBeNull();
    });
});
