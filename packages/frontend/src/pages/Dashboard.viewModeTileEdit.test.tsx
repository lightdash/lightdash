import { Ability } from '@casl/ability';
import {
    type DashboardChartTile,
    type PossibleAbilities,
} from '@lightdash/common';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../api';
import { AbilityContext } from '../providers/Ability/context';
import { manageChartRule } from '../testing/savedChartResponse.mock';
import { renderWithProviders } from '../testing/testUtils';

const mockedApi = vi.mocked(lightdashApi);

// Mock factories are hoisted above module scope, so the fixtures they share
// with the tests are hoisted too.
const fixtures = await vi.hoisted(async () => {
    const { DashboardTileTypes: TileTypes } = await import('@lightdash/common');
    const savedTile: DashboardChartTile = {
        uuid: 'tile-1',
        type: TileTypes.SAVED_CHART,
        x: 0,
        y: 0,
        w: 6,
        h: 6,
        tabUuid: undefined,
        properties: { savedChartUuid: 'chart-uuid', title: 'Revenue' },
    };
    return {
        PROJECT_UUID: 'project-uuid',
        DASHBOARD_UUID: 'dashboard-uuid',
        savedTile,
        renamedTile: {
            ...savedTile,
            properties: { ...savedTile.properties, title: 'Renamed revenue' },
        },
        savedFilters: {
            dimensions: [
                {
                    id: 'saved-filter',
                    target: {
                        fieldId: 'payments_status',
                        tableName: 'payments',
                    },
                    operator: 'equals',
                    values: ['paid'],
                },
            ],
            metrics: [],
            tableCalculations: [],
        },
        temporaryFilters: {
            dimensions: [
                {
                    id: 'temporary-filter',
                    target: {
                        fieldId: 'payments_method',
                        tableName: 'payments',
                    },
                    operator: 'equals',
                    values: ['card'],
                },
            ],
            metrics: [],
            tableCalculations: [],
        },
    };
});
const { PROJECT_UUID, DASHBOARD_UUID, renamedTile, savedFilters } = fixtures;

const state = vi.hoisted(() => ({
    verified: false,
    setDashboardTiles: vi.fn(),
    setHaveTilesChanged: vi.fn(),
}));

vi.mock('../api', () => ({ lightdashApi: vi.fn() }));
vi.mock('../hooks/useContentAuthoringEnabled', () => ({
    useContentAuthoringEnabled: () => true,
}));

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
            uuid: fixtures.DASHBOARD_UUID,
            name: 'Payments',
            slug: 'payments',
            projectUuid: fixtures.PROJECT_UUID,
            tiles: [fixtures.savedTile],
            filters: fixtures.savedFilters,
            tabs: [],
            config: { isDateZoomDisabled: true },
            parameters: { region: { parameterName: 'region', value: 'eu' } },
            get verification() {
                return state.verified
                    ? { verifiedBy: { userUuid: 'other-user' } }
                    : undefined;
            },
        },
        dashboardError: undefined,
        dashboardFilters: fixtures.savedFilters,
        dashboardTemporaryFilters: fixtures.temporaryFilters,
        dashboardTiles: [fixtures.savedTile],
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
        setDashboardTiles: state.setDashboardTiles,
        setDashboardTabs: vi.fn(),
        setDashboardFilters: vi.fn(),
        setDashboardTemporaryFilters: vi.fn(),
        setDashboardCustomMetrics: vi.fn(),
        setHaveTilesChanged: state.setHaveTilesChanged,
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

// The grid is not under test; a button stands in for a tile's content form.
vi.mock('../features/dashboardTabs', () => ({
    default: ({
        handleEditTile,
    }: {
        handleEditTile: (tile: DashboardChartTile) => void;
    }) => (
        <button
            type="button"
            onClick={() => handleEditTile(fixtures.renamedTile)}
        >
            Rename tile
        </button>
    ),
}));

vi.mock('../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: false } }),
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
    useProjectUuid: () => fixtures.PROJECT_UUID,
}));

vi.mock('../hooks/useProjectRoute', () => ({
    useOptionalProjectRoute: () => undefined,
    useProjectUrlIdentifier: () => fixtures.PROJECT_UUID,
}));

vi.mock('../components/Explorer', () => ({ default: () => null }));

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
    default: () => ({ projectUuid: fixtures.PROJECT_UUID }),
}));

vi.mock(
    '../ee/features/aiCopilot/components/AskAiAgentMenuItem/AskAiAgentMenuItem',
    () => ({ AskAiAgentMenuItem: () => null }),
);

// eslint-disable-next-line import/first
import DashboardPage from './Dashboard';

const ability = new Ability<PossibleAbilities>([
    manageChartRule,
    { action: 'manage', subject: 'Dashboard' },
]);

const UrlProbe = () => {
    const location = useLocation();
    return <div data-testid="url" data-pathname={location.pathname} />;
};

const renderDashboard = (mode: 'view' | 'edit') => {
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
        ],
        {
            initialEntries: [
                `/projects/${PROJECT_UUID}/dashboards/${DASHBOARD_UUID}/${mode}`,
            ],
        },
    );
    renderWithProviders(
        <AbilityContext.Provider value={ability}>
            <RouterProvider router={router} />
        </AbilityContext.Provider>,
        { user: { abilityRules: ability.rules } },
    );
};

describe('Dashboard tile edits from view mode', () => {
    const dashboardPatches = () =>
        mockedApi.mock.calls
            .filter(([request]) => request.method === 'PATCH')
            .map(([request]) => JSON.parse(request.body as string));

    beforeEach(() => {
        state.verified = false;
        state.setDashboardTiles.mockClear();
        state.setHaveTilesChanged.mockClear();
        mockedApi.mockReset();
        mockedApi.mockImplementation((async ({ method }) => {
            if (method === 'PATCH') {
                return {
                    uuid: DASHBOARD_UUID,
                    slug: 'payments',
                    tiles: [renamedTile],
                    tabs: [],
                };
            }
            return new Promise(() => {});
        }) as typeof lightdashApi);
    });

    it('saves the edited tile against the stored dashboard without staging it', async () => {
        renderDashboard('view');

        await userEvent.click(
            screen.getByRole('button', { name: 'Rename tile' }),
        );

        await waitFor(() => expect(dashboardPatches()).toHaveLength(1));
        expect(dashboardPatches()[0]).toEqual({
            tiles: [renamedTile],
            filters: savedFilters,
            tabs: [],
            config: { isDateZoomDisabled: true },
            parameters: { region: { parameterName: 'region', value: 'eu' } },
        });
        expect(state.setHaveTilesChanged).not.toHaveBeenCalled();
        await waitFor(() =>
            expect(state.setDashboardTiles).toHaveBeenCalledWith([renamedTile]),
        );
        expect(screen.getByTestId('url')).toHaveAttribute(
            'data-pathname',
            `/projects/${PROJECT_UUID}/dashboards/${DASHBOARD_UUID}/view`,
        );
    });

    it('stages the edited tile instead of saving while editing the dashboard', async () => {
        renderDashboard('edit');

        await userEvent.click(
            screen.getByRole('button', { name: 'Rename tile' }),
        );

        expect(state.setDashboardTiles).toHaveBeenCalled();
        expect(state.setHaveTilesChanged).toHaveBeenCalledWith(true);
        expect(dashboardPatches()).toHaveLength(0);
    });

    it('asks about verification before saving a verified dashboard', async () => {
        state.verified = true;
        renderDashboard('view');

        await userEvent.click(
            screen.getByRole('button', { name: 'Rename tile' }),
        );

        expect(
            await screen.findByText('Save verified dashboard'),
        ).toBeVisible();
        expect(dashboardPatches()).toHaveLength(0);

        await userEvent.click(
            screen.getByRole('button', { name: 'Save anyway' }),
        );

        await waitFor(() => expect(dashboardPatches()).toHaveLength(1));
        expect(dashboardPatches()[0].tiles).toEqual([renamedTile]);
        expect(dashboardPatches()[0].preserveVerification).toBe(false);
    });

    it('drops the edit when the verification prompt is cancelled', async () => {
        state.verified = true;
        renderDashboard('view');

        await userEvent.click(
            screen.getByRole('button', { name: 'Rename tile' }),
        );
        await userEvent.click(
            await screen.findByRole('button', { name: 'Cancel' }),
        );

        await waitFor(() =>
            expect(
                screen.queryByText('Save verified dashboard'),
            ).not.toBeInTheDocument(),
        );
        expect(dashboardPatches()).toHaveLength(0);
        expect(state.setHaveTilesChanged).not.toHaveBeenCalled();
    });
});
