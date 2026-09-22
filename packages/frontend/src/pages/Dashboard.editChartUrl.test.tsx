import { Ability } from '@casl/ability';
import {
    type CreateSavedChartVersion,
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

const state = vi.hoisted(() => ({ chartEditorEnabled: true }));

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
        dashboardTiles: [],
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
        dateZoomConfig: undefined,
        activeTab: undefined,
        haveTilesChanged: false,
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

vi.mock('../features/dashboardTabs', () => ({ default: () => null }));

vi.mock('../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        data: { enabled: state.chartEditorEnabled },
    }),
}));

vi.mock('../hooks/dashboard/useDashboard', () => ({
    useUpdateDashboard: () => ({ mutate: vi.fn(), isSuccess: false }),
    appendNewTilesToBottom: (tiles: unknown[]) => tiles,
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
    useExploreQueries: (names: unknown[]) =>
        names.map(() => ({ data: undefined, error: null })),
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

const manageChartAbility = new Ability<PossibleAbilities>([manageChartRule]);

const UrlProbe = () => {
    const location = useLocation();
    return <div data-testid="url">{location.search}</div>;
};

const renderDashboard = (search: string) => {
    const router = createMemoryRouter(
        [
            {
                path: '/projects/:projectUuid/dashboards/:dashboardUuid',
                element: (
                    <>
                        <UrlProbe />
                        <DashboardPage />
                    </>
                ),
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
