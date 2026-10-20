import {
    DashboardTileTypes,
    DateGranularity,
    FilterInteractivityValues,
    isSubDayGranularity,
    FilterOperator,
    type Dashboard,
    type DashboardAvailableFilters,
    type DashboardFilterRule,
    type DashboardFilters,
    type DashboardTab,
    type DashboardTile,
    type InteractivityOptions,
    type LanguageMap,
    type ParametersValuesMap,
} from '@lightdash/common';
import { act, cleanup, renderHook } from '@testing-library/react';
import { useEffect, type ReactNode } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type SdkFilter } from '../../ee/features/embed/EmbedDashboard/types';
import { LightdashEventType } from '../../ee/features/embed/events/types';
import {
    dashboardTileStatusActions,
    selectAppliedParameterValues,
    selectChartZoomableFieldsByTileUuid,
    selectControlGranularities,
    selectDateZoomGranularity,
    selectTilesWithDateZoomApplied,
    selectDashboardFilters,
    selectDashboardParameterDefinitions,
    selectDashboardParameterReferences,
    selectDashboardParameters,
    selectHasParameterOrderChanged,
    selectHaveFiltersChanged,
    selectHavePinnedParametersChanged,
    selectMissingRequiredParameters,
    emptyDashboardFilters,
    selectParameterOrder,
    selectParametersHaveChanged,
    selectParameterValues,
    selectPinnedParameters,
    selectTileParameterReferences,
    useDashboardAllFilters,
    useDashboardDispatch,
    useDashboardSelector,
    useDashboardTemporaryFilters,
    useDashboardUnmetFilterRequirements,
} from '../../features/dashboard/store';
import DashboardProvider from './DashboardProvider';
import useDashboardContext from './useDashboardContext';

const mocks = vi.hoisted(() => ({
    dashboard: undefined as unknown,
    isDashboardLoading: false,
    availableFilters: undefined as unknown,
    projectParameters: undefined as unknown,
    versionRefresh: vi.fn(),
    showToastWarning: vi.fn(),
    showToastInfo: vi.fn(),
    dispatchEmbedEvent: vi.fn(),
    tileStatus: {
        areAllChartsLoaded: false,
        availableCustomGranularities: {} as Record<string, string>,
    },
    embed: { mode: 'direct', filters: undefined } as {
        mode: string;
        filters: unknown;
        dispatchEmbedEvent?: unknown;
    },
}));

vi.mock('../../ee/providers/Embed/useEmbed', () => ({
    default: () => mocks.embed,
}));
vi.mock('../../hooks/dashboard/useDashboard', () => ({
    useDashboardQuery: () => ({
        data: mocks.dashboard,
        isInitialLoading: mocks.isDashboardLoading,
        error: null,
    }),
    useDashboardVersionRefresh: () => ({
        mutateAsync: mocks.versionRefresh,
        isLoading: false,
    }),
    useDashboardsAvailableFilters: () => ({
        data: mocks.availableFilters,
        isInitialLoading: false,
        isFetching: false,
    }),
}));
const toaster = {
    showToastWarning: mocks.showToastWarning,
    showToastInfo: mocks.showToastInfo,
};
vi.mock('../../hooks/toaster/useToaster', () => ({
    default: () => toaster,
}));
vi.mock('../../features/comments', () => ({
    useGetComments: () => ({ data: undefined }),
}));
vi.mock('../../features/parameters', () => ({
    useParameters: () => ({ data: mocks.projectParameters }),
}));
vi.mock('./DashboardTileStatusProvider', () => ({
    default: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('./useDashboardTileStatusContext', () => ({
    default: (selector: (context: Record<string, unknown>) => unknown) =>
        selector({
            chartTileUuidsToLoad: mocks.tileStatus.areAllChartsLoaded
                ? []
                : undefined,
        }),
}));

// ---------------------------------------------------------------------------
// ADAPTER: the only section that should change when the state source moves.
// Assertions below read and write exclusively through `useHarness`.
// ---------------------------------------------------------------------------

const useStoreValues = () => ({
    dashboardFilters: useDashboardSelector(selectDashboardFilters),
    originalDashboardFilters: useDashboardContext(
        (context) => context.dashboard?.filters ?? emptyDashboardFilters,
    ),
    dashboardTemporaryFilters: useDashboardTemporaryFilters(),
    allFilters: useDashboardAllFilters(),
    haveFiltersChanged: useDashboardSelector(selectHaveFiltersChanged),
    unmetFilterRequirements: useDashboardUnmetFilterRequirements(),
    parametersHaveChanged: useDashboardSelector(selectParametersHaveChanged),
    dashboardParameters: useDashboardSelector(selectDashboardParameters),
    parameterValues: useDashboardSelector(selectParameterValues),
    appliedParameterValues: useDashboardSelector(selectAppliedParameterValues),
    parameterDefinitions: useDashboardSelector(
        selectDashboardParameterDefinitions,
    ),
    dashboardParameterReferences: useDashboardSelector(
        selectDashboardParameterReferences,
    ),
    tileParameterReferences: useDashboardSelector(
        selectTileParameterReferences,
    ),
    missingRequiredParameters: useDashboardSelector(
        selectMissingRequiredParameters,
    ),
    pinnedParameters: useDashboardSelector(selectPinnedParameters),
    havePinnedParametersChanged: useDashboardSelector(
        selectHavePinnedParametersChanged,
    ),
    parameterOrder: useDashboardSelector(selectParameterOrder),
    hasParameterOrderChanged: useDashboardSelector(
        selectHasParameterOrderChanged,
    ),
});

const useDateZoomValues = () => ({
    dateZoomGranularity: useDashboardSelector(selectDateZoomGranularity),
    controlGranularities: useDashboardSelector(selectControlGranularities),
    tilesWithDateZoomApplied: useDashboardSelector(
        selectTilesWithDateZoomApplied,
    ),
    chartZoomableFieldsByTileUuid: useDashboardSelector(
        selectChartZoomableFieldsByTileUuid,
    ),
});

// Tiles report their explores' custom granularities to the store
const useReportCustomGranularities = () => {
    const dispatch = useDashboardDispatch();
    return (granularities: Record<string, string>) =>
        dispatch(
            dashboardTileStatusActions.addAvailableCustomGranularities(
                granularities,
            ),
        );
};

// Editable dashboard state staged until save or cancel
const useEditValues = () => ({
    dashboardTiles: useDashboardContext((c) => c.dashboardTiles),
    haveTilesChanged: useDashboardContext((c) => c.haveTilesChanged),
    dashboardTabs: useDashboardContext((c) => c.dashboardTabs),
    haveTabsChanged: useDashboardContext((c) => c.haveTabsChanged),
    activeTab: useDashboardContext((c) => c.activeTab),
    dashboardCustomMetrics: useDashboardContext(
        (c) => c.dashboardCustomMetrics,
    ),
    haveCustomMetricsChanged: useDashboardContext(
        (c) => c.haveCustomMetricsChanged,
    ),
    isDateZoomDisabled: useDashboardContext((c) => c.isDateZoomDisabled),
    isAddFilterDisabled: useDashboardContext((c) => c.isAddFilterDisabled),
    requiredFiltersNote: useDashboardContext((c) => c.requiredFiltersNote),
    dateZoomConfig: useDashboardContext((c) => c.dateZoomConfig),
    hasDateZoomConfigChanged: useDashboardContext(
        (c) => c.hasDateZoomConfigChanged,
    ),
    dateZoomGranularities: useDashboardContext(
        (c) => c.dateZoomGranularities,
    ),
    haveDateZoomGranularitiesChanged: useDashboardContext(
        (c) => c.haveDateZoomGranularitiesChanged,
    ),
    defaultDateZoomGranularity: useDashboardContext(
        (c) => c.defaultDateZoomGranularity,
    ),
    hasDefaultDateZoomGranularityChanged: useDashboardContext(
        (c) => c.hasDefaultDateZoomGranularityChanged,
    ),
});

const useHarness = () => ({
    ...useDashboardContext((context) => context),
    reportCustomGranularities: useReportCustomGranularities(),
    ...useStoreValues(),
    ...useDateZoomValues(),
    ...useEditValues(),
    search: useLocation().search,
});

type ProviderOptions = {
    schedulerParameters?: ParametersValuesMap;
    parameterLabelOverrides?: LanguageMap['parameters'];
    projectUuid?: string;
    dateZoom?: string;
    // Mirrors pages/Dashboard.tsx: seed tiles, tabs and saved parameters once
    // the dashboard query resolves.
    loadLikeDashboardPage?: boolean;
};

const DashboardPageLoader = () => {
    const isDashboardLoading = useDashboardContext((c) => c.isDashboardLoading);
    const dashboard = useDashboardContext((c) => c.dashboard);
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const setDashboardTiles = useDashboardContext((c) => c.setDashboardTiles);
    const setDashboardTabs = useDashboardContext((c) => c.setDashboardTabs);
    const setSavedParameters = useDashboardContext((c) => c.setSavedParameters);
    useEffect(() => {
        if (isDashboardLoading) return;
        if (dashboardTiles) return;
        setDashboardTiles(dashboard?.tiles ?? []);
        setDashboardTabs(dashboard?.tabs ?? []);
        setSavedParameters(dashboard?.parameters ?? {});
    }, [
        isDashboardLoading,
        dashboard,
        dashboardTiles,
        setDashboardTiles,
        setDashboardTabs,
        setSavedParameters,
    ]);
    return null;
};

const renderDashboard = (
    path = '/dashboard/dashboard-uuid',
    {
        schedulerParameters,
        parameterLabelOverrides,
        projectUuid = 'project-uuid',
        dateZoom,
        loadLikeDashboardPage = true,
    }: ProviderOptions = {},
) =>
    renderHook(() => useHarness(), {
        wrapper: ({ children }: { children: ReactNode }) => {
            const element = (
                <DashboardProvider
                    projectUuid={projectUuid}
                    schedulerParameters={schedulerParameters}
                    parameterLabelOverrides={parameterLabelOverrides}
                    dateZoom={dateZoom}
                >
                    {loadLikeDashboardPage && <DashboardPageLoader />}
                    {children}
                </DashboardProvider>
            );
            return (
                <MemoryRouter initialEntries={[path]}>
                    <Routes>
                        <Route
                            path="/dashboard/:dashboardUuid/:mode?"
                            element={element}
                        />
                        <Route
                            path="/dashboard/:dashboardUuid/:mode/tabs/:tabUuid"
                            element={element}
                        />
                    </Routes>
                </MemoryRouter>
            );
        },
    });

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const emptyFilters: DashboardFilters = {
    dimensions: [],
    metrics: [],
    tableCalculations: [],
};

const rule = (
    id: string,
    fieldId: string,
    values: unknown[],
    extra: Partial<DashboardFilterRule> = {},
): DashboardFilterRule => ({
    id,
    label: undefined,
    target: { fieldId, tableName: 'orders' },
    operator: FilterOperator.EQUALS,
    values,
    ...extra,
});

const chartTile = (uuid: string, tabUuid?: string): DashboardTile => ({
    uuid,
    type: DashboardTileTypes.SAVED_CHART,
    x: 0,
    y: 0,
    w: 6,
    h: 3,
    tabUuid,
    properties: {
        savedChartUuid: `chart-${uuid}`,
        title: uuid,
        belongsToDashboard: false,
    },
});

const makeDashboard = (overrides: Partial<Dashboard> = {}): Dashboard => ({
    organizationUuid: 'org-uuid',
    projectUuid: 'project-uuid',
    dashboardVersionId: 1,
    versionUuid: 'version-uuid',
    uuid: 'dashboard-uuid',
    name: 'Dashboard',
    verification: null,
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    tiles: [chartTile('tile-1'), chartTile('tile-2')],
    filters: emptyFilters,
    spaceUuid: 'space-uuid',
    spaceName: 'Space',
    views: 0,
    firstViewedAt: null,
    pinnedListUuid: null,
    pinnedListOrder: null,
    tabs: [],
    inheritsFromOrgOrProject: false,
    access: null,
    slug: 'dashboard',
    colorPaletteUuid: null,
    owner: null,
    ...overrides,
});

const statusFilter = rule('saved-status', 'orders_status', ['completed']);
const regionFilter = rule('saved-region', 'orders_region', ['EU']);
const revenueMetricFilter = rule('saved-revenue', 'orders_revenue', [100], {
    operator: FilterOperator.GREATER_THAN,
});
const savedFilters: DashboardFilters = {
    dimensions: [statusFilter, regionFilter],
    metrics: [revenueMetricFilter],
    tableCalculations: [],
};

const tabA: DashboardTab = { uuid: 'tab-a', name: 'A', order: 0 };
const tabB: DashboardTab = { uuid: 'tab-b', name: 'B', order: 1 };

const searchParam = (search: string, key: string) =>
    new URLSearchParams(search).get(key);
const jsonParam = (search: string, key: string): unknown => {
    const value = searchParam(search, key);
    return value === null ? null : JSON.parse(value);
};
const urlFor = (base: string, params: Record<string, unknown>) =>
    `${base}?${new URLSearchParams(
        Object.fromEntries(
            Object.entries(params).map(([k, v]) => [
                k,
                typeof v === 'string' ? v : JSON.stringify(v),
            ]),
        ),
    ).toString()}`;

beforeEach(() => {
    mocks.dashboard = undefined;
    mocks.isDashboardLoading = false;
    mocks.availableFilters = undefined;
    mocks.projectParameters = undefined;
    mocks.tileStatus = {
        areAllChartsLoaded: false,
        availableCustomGranularities: {},
    };
    mocks.embed = {
        mode: 'direct',
        filters: undefined,
        dispatchEmbedEvent: mocks.dispatchEmbedEvent,
    };
    sessionStorage.clear();
});

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// FILTERS
// ---------------------------------------------------------------------------

describe('filters: load', () => {
    it('seeds dashboard and original filters from the saved dashboard', () => {
        mocks.dashboard = makeDashboard({ filters: savedFilters });
        const { result } = renderDashboard();
        expect(result.current.dashboardFilters).toEqual(savedFilters);
        expect(result.current.originalDashboardFilters).toBe(savedFilters);
        expect(result.current.haveFiltersChanged).toBe(false);
        expect(result.current.dashboardTemporaryFilters).toEqual(emptyFilters);
        expect(result.current.allFilters).toEqual(savedFilters);
        expect(result.current.search).toBe('');
    });

    it('starts empty while the dashboard is not loaded', () => {
        const { result } = renderDashboard();
        expect(result.current.dashboardFilters).toEqual(emptyFilters);
        expect(result.current.originalDashboardFilters).toEqual(emptyFilters);
        expect(result.current.allFilters).toEqual(emptyFilters);
    });

    it('composes allFilters from saved and temporary filters in all categories', () => {
        mocks.dashboard = makeDashboard({ filters: savedFilters });
        const { result } = renderDashboard();
        const tempDim = rule('temp-dim', 'orders_city', ['Lisbon']);
        const tempMetric = rule('temp-metric', 'orders_count', [5]);
        const tempTableCalc = rule('temp-tc', 'tc_ratio', [1]);
        act(() =>
            result.current.setDashboardTemporaryFilters({
                dimensions: [tempDim],
                metrics: [tempMetric],
                tableCalculations: [tempTableCalc],
            }),
        );
        expect(result.current.allFilters).toEqual({
            dimensions: [statusFilter, regionFilter, tempDim],
            metrics: [revenueMetricFilter, tempMetric],
            tableCalculations: [tempTableCalc],
        });
    });
});

describe('filters: URL overrides on load', () => {
    const statusOverride = { ...statusFilter, values: ['returned'] };

    it.each(['direct', 'sdk'])(
        'applies a dimension override from the URL (%s mode, no SDK filters)',
        (mode) => {
            mocks.embed = { ...mocks.embed, mode };
            mocks.dashboard = makeDashboard({ filters: savedFilters });
            const { result } = renderDashboard(
                urlFor('/dashboard/dashboard-uuid', {
                    filters: { dimensions: [statusOverride], metrics: [] },
                }),
            );
            expect(result.current.dashboardFilters.dimensions).toEqual([
                statusOverride,
                regionFilter,
            ]);
            expect(result.current.haveFiltersChanged).toBe(true);
            expect(result.current.originalDashboardFilters).toBe(savedFilters);
        },
    );

    it('keeps the overrides in the URL', () => {
        mocks.dashboard = makeDashboard({ filters: savedFilters });
        const { result } = renderDashboard(
            urlFor('/dashboard/dashboard-uuid', {
                filters: { dimensions: [statusOverride], metrics: [] },
            }),
        );
        expect(jsonParam(result.current.search, 'filters')).toEqual({
            dimensions: [statusOverride],
            metrics: [],
            tableCalculations: [],
        });
    });

    it('drops lock and requirement metadata a shared link tries to assert', () => {
        mocks.dashboard = makeDashboard({ filters: savedFilters });
        const crafted = {
            ...rule('url-only', 'orders_city', ['Lisbon']),
            lockedTabUuids: ['tab-a'],
            required: true,
            requiredGroupId: 'group-1',
        };
        const { result } = renderDashboard(
            urlFor('/dashboard/dashboard-uuid', {
                filters: { dimensions: [crafted], metrics: [] },
            }),
        );
        const appended = result.current.dashboardFilters.dimensions.find(
            ({ id }) => id === 'url-only',
        );
        expect(appended?.values).toEqual(['Lisbon']);
        expect(appended?.lockedTabUuids).toBeUndefined();
        expect(appended?.required).toBeUndefined();
        expect(appended?.requiredGroupId).toBeUndefined();
        expect(jsonParam(result.current.search, 'filters')).not.toHaveProperty(
            'dimensions.0.lockedTabUuids',
        );
    });

    it('applies a metric override from the URL', () => {
        mocks.dashboard = makeDashboard({ filters: savedFilters });
        const metricOverride = { ...revenueMetricFilter, values: [500] };
        const { result } = renderDashboard(
            urlFor('/dashboard/dashboard-uuid', {
                filters: { dimensions: [], metrics: [metricOverride] },
            }),
        );
        expect(result.current.dashboardFilters.metrics).toEqual([
            metricOverride,
        ]);
        expect(result.current.dashboardFilters.dimensions).toEqual(
            savedFilters.dimensions,
        );
        expect(result.current.haveFiltersChanged).toBe(true);
    });

    it('re-homes a field-matched override with a different id onto the saved filter', () => {
        mocks.dashboard = makeDashboard({ filters: savedFilters });
        const foreignIdOverride = {
            ...statusFilter,
            id: 'stale-id',
            values: ['returned'],
        };
        const { result } = renderDashboard(
            urlFor('/dashboard/dashboard-uuid', {
                filters: { dimensions: [foreignIdOverride], metrics: [] },
            }),
        );
        expect(result.current.dashboardFilters.dimensions).toEqual([
            { ...statusFilter, values: ['returned'] },
            regionFilter,
        ]);
        expect(
            (
                jsonParam(result.current.search, 'filters') as DashboardFilters
            ).dimensions.map((d) => d.id),
        ).toEqual(['saved-status']);
    });

    it('appends an override that matches no saved filter', () => {
        mocks.dashboard = makeDashboard({ filters: savedFilters });
        const extra = rule('extra', 'orders_city', ['Porto'], {
            required: true,
        });
        const { result } = renderDashboard(
            urlFor('/dashboard/dashboard-uuid', {
                filters: { dimensions: [extra], metrics: [] },
            }),
        );
        expect(result.current.dashboardFilters.dimensions).toEqual([
            statusFilter,
            regionFilter,
            { ...extra, required: undefined, requiredGroupId: undefined },
        ]);
    });

    it('strips lock and requirement metadata from URL overrides', () => {
        mocks.dashboard = makeDashboard({ filters: savedFilters });
        const crafted = {
            ...statusFilter,
            values: ['returned'],
            lockedTabUuids: ['x'],
            required: true,
            requiredGroupId: 'g',
        };
        const { result } = renderDashboard(
            urlFor('/dashboard/dashboard-uuid', {
                filters: { dimensions: [crafted], metrics: [] },
            }),
        );
        expect(result.current.dashboardFilters.dimensions[0]).toEqual({
            ...statusFilter,
            values: ['returned'],
            lockedTabUuids: undefined,
            required: undefined,
            requiredGroupId: undefined,
        });
    });

    it('warns when the filters param is malformed', () => {
        mocks.dashboard = makeDashboard({ filters: savedFilters });
        const { result } = renderDashboard(
            '/dashboard/dashboard-uuid?filters=%7Bnot-json',
        );
        expect(mocks.showToastWarning).toHaveBeenCalledWith({
            title: 'Could not restore filters from URL',
            subtitle:
                'The link appears to be incomplete. Please ask for it to be shared again.',
        });
        expect(result.current.dashboardFilters).toEqual(savedFilters);
        expect(searchParam(result.current.search, 'filters')).toBeNull();
    });
});

describe('filters: locked filters', () => {
    const lockedStatus = { ...statusFilter, lockedTabUuids: ['dashboard'] };
    const lockedRegion = { ...regionFilter, lockedTabUuids: ['dashboard'] };

    it('drops a URL override for a dashboard-wide locked filter and toasts once', () => {
        mocks.dashboard = makeDashboard({
            filters: {
                ...savedFilters,
                dimensions: [lockedStatus, regionFilter],
            },
        });
        const { result } = renderDashboard(
            urlFor('/dashboard/dashboard-uuid', {
                filters: {
                    dimensions: [{ ...statusFilter, values: ['returned'] }],
                    metrics: [],
                },
            }),
        );
        expect(result.current.dashboardFilters.dimensions).toEqual([
            lockedStatus,
            regionFilter,
        ]);
        expect(result.current.haveFiltersChanged).toBe(false);
        expect(mocks.showToastInfo).toHaveBeenCalledTimes(1);
        expect(mocks.showToastInfo).toHaveBeenCalledWith({
            title: 'Locked dashboard filter',
            subtitle:
                'A filter override was ignored because the dashboard editor locked that filter.',
        });
    });

    it('uses the plural subtitle when several overrides are dropped', () => {
        mocks.dashboard = makeDashboard({
            filters: {
                ...savedFilters,
                dimensions: [lockedStatus, lockedRegion],
            },
        });
        renderDashboard(
            urlFor('/dashboard/dashboard-uuid', {
                filters: {
                    dimensions: [
                        { ...statusFilter, values: ['returned'] },
                        { ...regionFilter, values: ['US'] },
                    ],
                    metrics: [],
                },
            }),
        );
        expect(mocks.showToastInfo).toHaveBeenCalledTimes(1);
        expect(mocks.showToastInfo).toHaveBeenCalledWith({
            title: 'Locked dashboard filter',
            subtitle:
                '2 filter overrides were ignored because the dashboard editor locked those filters.',
        });
    });

    it('drops a URL override only on the tab where the filter is locked', () => {
        const lockedOnB = { ...statusFilter, lockedTabUuids: ['tab-b'] };
        mocks.dashboard = makeDashboard({
            tabs: [tabA, tabB],
            tiles: [chartTile('tile-1', 'tab-a'), chartTile('tile-2', 'tab-b')],
            filters: { ...savedFilters, dimensions: [lockedOnB, regionFilter] },
        });
        const override = {
            filters: {
                dimensions: [{ ...statusFilter, values: ['returned'] }],
                metrics: [],
            },
        };
        const onA = renderDashboard(
            urlFor('/dashboard/dashboard-uuid/view/tabs/tab-a', override),
        );
        expect(onA.result.current.activeTab?.uuid).toBe('tab-a');
        expect(
            onA.result.current.dashboardFilters.dimensions[0].values,
        ).toEqual(['returned']);
        expect(mocks.showToastInfo).not.toHaveBeenCalled();
        onA.unmount();

        const onB = renderDashboard(
            urlFor('/dashboard/dashboard-uuid/view/tabs/tab-b', override),
        );
        expect(onB.result.current.activeTab?.uuid).toBe('tab-b');
        // quirk: the load effect runs before the active tab resolves, so
        // nothing is stripped and the override bypasses the tab lock
        expect(
            onB.result.current.dashboardFilters.dimensions[0].values,
        ).toEqual(['returned']);
    });

    it('hides a temporary filter on a locked tab and restores it on an unlocked tab, toasting once', () => {
        const lockedOnA = { ...statusFilter, lockedTabUuids: ['tab-a'] };
        mocks.dashboard = makeDashboard({
            tabs: [tabA, tabB],
            filters: { ...savedFilters, dimensions: [lockedOnA, regionFilter] },
        });
        const { result } = renderDashboard(
            '/dashboard/dashboard-uuid/view/tabs/tab-a',
        );
        const tempStatus = rule('temp-status', 'orders_status', ['returned']);
        act(() => result.current.addDimensionDashboardFilter(tempStatus, true));
        expect(result.current.dashboardTemporaryFilters.dimensions).toEqual([]);
        expect(result.current.allFilters.dimensions).toEqual([
            lockedOnA,
            regionFilter,
        ]);
        expect(searchParam(result.current.search, 'tempFilters')).toBeNull();
        expect(mocks.showToastInfo).toHaveBeenCalledTimes(1);
        expect(mocks.showToastInfo).toHaveBeenCalledWith({
            title: 'Locked dashboard filter',
            subtitle:
                'A temporary filter was ignored because the dashboard editor locked it on this tab.',
        });

        act(() => result.current.setActiveTab(tabB));
        expect(result.current.dashboardTemporaryFilters.dimensions).toEqual([
            tempStatus,
        ]);
        expect(result.current.allFilters.dimensions).toEqual([
            lockedOnA,
            regionFilter,
            tempStatus,
        ]);
        expect(jsonParam(result.current.search, 'tempFilters')).toEqual({
            dimensions: [tempStatus],
            metrics: [],
            tableCalculations: [],
        });

        act(() => result.current.setActiveTab(tabA));
        expect(result.current.dashboardTemporaryFilters.dimensions).toEqual([]);
        expect(mocks.showToastInfo).toHaveBeenCalledTimes(1);
    });
});

describe('filters: temporary filters from the URL', () => {
    it('restores tempFilters on mount', () => {
        mocks.dashboard = makeDashboard({ filters: savedFilters });
        const temp = rule('temp-city', 'orders_city', ['Lisbon']);
        const { result } = renderDashboard(
            urlFor('/dashboard/dashboard-uuid', {
                tempFilters: {
                    dimensions: [temp],
                    metrics: [],
                    tableCalculations: [],
                },
            }),
        );
        expect(result.current.dashboardTemporaryFilters).toEqual({
            dimensions: [temp],
            metrics: [],
            tableCalculations: [],
        });
        expect(result.current.allFilters.dimensions).toEqual([
            statusFilter,
            regionFilter,
            temp,
        ]);
        expect(result.current.haveFiltersChanged).toBe(false);
    });

    it('warns when tempFilters is malformed', () => {
        mocks.dashboard = makeDashboard({ filters: savedFilters });
        const { result } = renderDashboard(
            '/dashboard/dashboard-uuid?tempFilters=%7Bbroken',
        );
        expect(mocks.showToastWarning).toHaveBeenCalledWith({
            title: 'Could not restore filters from URL',
            subtitle:
                'The link appears to be incomplete. Please ask for it to be shared again.',
        });
        expect(result.current.dashboardTemporaryFilters).toEqual(emptyFilters);
        expect(searchParam(result.current.search, 'tempFilters')).toBeNull();
    });
});

describe('filters: unsaved filters in session storage', () => {
    it('restores and removes unsavedDashboardFilters for the dashboard', () => {
        const unsaved: DashboardFilters = {
            dimensions: [{ ...statusFilter, values: ['pending'] }],
            metrics: [],
            tableCalculations: [],
        };
        sessionStorage.setItem(
            'unsavedDashboardFilters:dashboard-uuid',
            JSON.stringify(unsaved),
        );
        mocks.dashboard = makeDashboard({ filters: savedFilters });
        const { result } = renderDashboard();
        expect(result.current.dashboardFilters).toEqual(unsaved);
        expect(result.current.originalDashboardFilters).toBe(savedFilters);
        expect(
            sessionStorage.getItem('unsavedDashboardFilters:dashboard-uuid'),
        ).toBeNull();
        // quirk: restored unsaved filters do not flag haveFiltersChanged
        expect(result.current.haveFiltersChanged).toBe(false);
    });

    it('warns and falls back to saved filters when the stored value is malformed', () => {
        sessionStorage.setItem(
            'unsavedDashboardFilters:dashboard-uuid',
            '{broken',
        );
        mocks.dashboard = makeDashboard({ filters: savedFilters });
        const { result } = renderDashboard();
        expect(mocks.showToastWarning).toHaveBeenCalledWith({
            title: 'Could not restore unsaved filters',
            subtitle: 'Your previous filter changes could not be loaded',
        });
        expect(result.current.dashboardFilters).toEqual(savedFilters);
        expect(
            sessionStorage.getItem('unsavedDashboardFilters:dashboard-uuid'),
        ).toBeNull();
    });

    it('ignores storage for another dashboard', () => {
        sessionStorage.setItem(
            'unsavedDashboardFilters:other-uuid',
            JSON.stringify(emptyFilters),
        );
        mocks.dashboard = makeDashboard({ filters: savedFilters });
        const { result } = renderDashboard();
        expect(result.current.dashboardFilters).toEqual(savedFilters);
        expect(
            sessionStorage.getItem('unsavedDashboardFilters:other-uuid'),
        ).not.toBeNull();
    });
});

describe('filters: add, update, remove', () => {
    const city = rule('city', 'orders_city', ['Lisbon']);
    const count = rule('count', 'orders_count', [5]);

    it.each([false, true])(
        'adds a dimension filter (temporary=%s)',
        (isTemporary) => {
            mocks.dashboard = makeDashboard({ filters: savedFilters });
            const { result } = renderDashboard();
            act(() =>
                result.current.addDimensionDashboardFilter(city, isTemporary),
            );
            const target = isTemporary
                ? result.current.dashboardTemporaryFilters
                : result.current.dashboardFilters;
            expect(target.dimensions.at(-1)).toEqual(city);
            expect(result.current.allFilters.dimensions).toEqual([
                statusFilter,
                regionFilter,
                city,
            ]);
            expect(result.current.haveFiltersChanged).toBe(true);
        },
    );

    it.each([false, true])(
        'adds a metric filter (temporary=%s)',
        (isTemporary) => {
            mocks.dashboard = makeDashboard({ filters: savedFilters });
            const { result } = renderDashboard();
            act(() =>
                result.current.addMetricDashboardFilter(count, isTemporary),
            );
            const target = isTemporary
                ? result.current.dashboardTemporaryFilters
                : result.current.dashboardFilters;
            expect(target.metrics.at(-1)).toEqual(count);
            expect(result.current.allFilters.metrics).toEqual([
                revenueMetricFilter,
                count,
            ]);
            expect(result.current.haveFiltersChanged).toBe(true);
        },
    );

    it('updates and removes temporary dimension and metric filters', () => {
        mocks.dashboard = makeDashboard({ filters: savedFilters });
        const { result } = renderDashboard();
        act(() => {
            result.current.addDimensionDashboardFilter(city, true);
            result.current.addMetricDashboardFilter(count, true);
        });
        const porto = { ...city, values: ['Porto'] };
        const six = { ...count, values: [6] };
        act(() => {
            result.current.updateDimensionDashboardFilter(
                porto,
                0,
                true,
                false,
            );
            result.current.updateMetricDashboardFilter(six, 0, true, false);
        });
        expect(result.current.dashboardTemporaryFilters).toEqual({
            dimensions: [porto],
            metrics: [six],
            tableCalculations: [],
        });
        expect(jsonParam(result.current.search, 'tempFilters')).toEqual({
            dimensions: [porto],
            metrics: [six],
            tableCalculations: [],
        });
        expect(searchParam(result.current.search, 'filters')).toBeNull();

        act(() => {
            result.current.removeDimensionDashboardFilter(0, true);
            result.current.removeMetricDashboardFilter(0, true);
        });
        expect(result.current.dashboardTemporaryFilters).toEqual(emptyFilters);
        expect(searchParam(result.current.search, 'tempFilters')).toBeNull();
        expect(result.current.haveFiltersChanged).toBe(true);
    });

    it('removes saved dimension and metric filters', () => {
        mocks.dashboard = makeDashboard({ filters: savedFilters });
        const { result } = renderDashboard();
        act(() => result.current.removeDimensionDashboardFilter(0, false));
        expect(result.current.dashboardFilters.dimensions).toEqual([
            regionFilter,
        ]);
        act(() => result.current.removeMetricDashboardFilter(0, false));
        expect(result.current.dashboardFilters.metrics).toEqual([]);
        expect(result.current.haveFiltersChanged).toBe(true);
        expect(result.current.originalDashboardFilters).toBe(savedFilters);
    });

    it('removing a saved filter drops its URL override', () => {
        mocks.dashboard = makeDashboard({ filters: savedFilters });
        const { result } = renderDashboard();
        act(() =>
            result.current.updateDimensionDashboardFilter(
                { ...statusFilter, values: ['returned'] },
                0,
                false,
                false,
            ),
        );
        expect(searchParam(result.current.search, 'filters')).not.toBeNull();
        act(() => result.current.removeDimensionDashboardFilter(0, false));
        expect(searchParam(result.current.search, 'filters')).toBeNull();
    });
});

describe('filters: saved filter overrides in view mode', () => {
    it('writes a dimension override to the URL and reverting removes it', () => {
        mocks.dashboard = makeDashboard({ filters: savedFilters });
        const { result } = renderDashboard();
        const returned = { ...statusFilter, values: ['returned'] };
        act(() =>
            result.current.updateDimensionDashboardFilter(
                returned,
                0,
                false,
                false,
            ),
        );
        expect(result.current.dashboardFilters.dimensions).toEqual([
            returned,
            regionFilter,
        ]);
        expect(result.current.haveFiltersChanged).toBe(true);
        expect(jsonParam(result.current.search, 'filters')).toEqual({
            dimensions: [returned],
            metrics: [],
            tableCalculations: [],
        });

        act(() =>
            result.current.updateDimensionDashboardFilter(
                statusFilter,
                0,
                false,
                false,
            ),
        );
        expect(result.current.dashboardFilters.dimensions).toEqual([
            statusFilter,
            regionFilter,
        ]);
        expect(searchParam(result.current.search, 'filters')).toBeNull();
        // quirk: reverting sets haveFiltersChanged(false) inside the state
        // updater, then the unconditional setHaveFiltersChanged(true) wins
        expect(result.current.haveFiltersChanged).toBe(true);
    });

    it('writes a metric override to the URL and reverting removes it', () => {
        mocks.dashboard = makeDashboard({ filters: savedFilters });
        const { result } = renderDashboard();
        const fiveHundred = { ...revenueMetricFilter, values: [500] };
        act(() =>
            result.current.updateMetricDashboardFilter(
                fiveHundred,
                0,
                false,
                false,
            ),
        );
        expect(result.current.dashboardFilters.metrics).toEqual([fiveHundred]);
        expect(jsonParam(result.current.search, 'filters')).toEqual({
            dimensions: [],
            metrics: [fiveHundred],
            tableCalculations: [],
        });
        act(() =>
            result.current.updateMetricDashboardFilter(
                revenueMetricFilter,
                0,
                false,
                false,
            ),
        );
        expect(searchParam(result.current.search, 'filters')).toBeNull();
        expect(result.current.haveFiltersChanged).toBe(true);
    });

    it('compresses tile targets that match the filter field', () => {
        const targeted = {
            ...statusFilter,
            tileTargets: {
                'tile-1': { fieldId: 'orders_status', tableName: 'orders' },
                'tile-2': false as const,
            },
        };
        mocks.dashboard = makeDashboard({
            filters: { ...savedFilters, dimensions: [targeted] },
        });
        const { result } = renderDashboard();
        act(() =>
            result.current.updateDimensionDashboardFilter(
                { ...targeted, values: ['returned'] },
                0,
                false,
                false,
            ),
        );
        // the URL override never carries tile targets
        expect(jsonParam(result.current.search, 'filters')).toEqual({
            dimensions: [{ ...statusFilter, values: ['returned'] }],
            metrics: [],
            tableCalculations: [],
        });
    });

    it('edit-mode updates remove the override instead of adding one', () => {
        mocks.dashboard = makeDashboard({ filters: savedFilters });
        const { result } = renderDashboard();
        act(() =>
            result.current.updateDimensionDashboardFilter(
                { ...statusFilter, values: ['returned'] },
                0,
                false,
                false,
            ),
        );
        expect(searchParam(result.current.search, 'filters')).not.toBeNull();
        act(() =>
            result.current.updateDimensionDashboardFilter(
                { ...statusFilter, values: ['pending'] },
                0,
                false,
                true,
            ),
        );
        expect(searchParam(result.current.search, 'filters')).toBeNull();
        expect(result.current.dashboardFilters.dimensions[0].values).toEqual([
            'pending',
        ]);
        expect(result.current.haveFiltersChanged).toBe(true);
    });

    it('does not add an override for a filter that is not saved', () => {
        mocks.dashboard = makeDashboard({ filters: savedFilters });
        const { result } = renderDashboard();
        const city = rule('city', 'orders_city', ['Lisbon']);
        act(() => result.current.addDimensionDashboardFilter(city, false));
        act(() =>
            result.current.updateDimensionDashboardFilter(
                { ...city, values: ['Porto'] },
                2,
                false,
                false,
            ),
        );
        expect(result.current.dashboardFilters.dimensions[2].values).toEqual([
            'Porto',
        ]);
        expect(searchParam(result.current.search, 'filters')).toBeNull();
    });
});

describe('filters: reset', () => {
    it('restores saved filters and clears temporary filters and URL state', () => {
        mocks.dashboard = makeDashboard({ filters: savedFilters });
        const { result } = renderDashboard();
        act(() => {
            result.current.updateDimensionDashboardFilter(
                { ...statusFilter, values: ['returned'] },
                0,
                false,
                false,
            );
            result.current.addDimensionDashboardFilter(
                rule('city', 'orders_city', ['Lisbon']),
                true,
            );
        });
        expect(searchParam(result.current.search, 'filters')).not.toBeNull();
        expect(
            searchParam(result.current.search, 'tempFilters'),
        ).not.toBeNull();

        act(() => result.current.resetDashboardFilters());
        expect(result.current.dashboardFilters).toBe(savedFilters);
        expect(result.current.dashboardTemporaryFilters).toEqual(emptyFilters);
        expect(result.current.allFilters).toEqual(savedFilters);
        expect(result.current.search).toBe('');
        // quirk: reset does not clear haveFiltersChanged
        expect(result.current.haveFiltersChanged).toBe(true);
    });
});

describe('filters: requirements', () => {
    it('reports required filters without values and clears once given a value', () => {
        const requiredEmpty = rule('req', 'orders_status', [], {
            required: true,
        });
        mocks.dashboard = makeDashboard({
            filters: { ...emptyFilters, dimensions: [requiredEmpty] },
        });
        const { result } = renderDashboard();
        expect(result.current.unmetFilterRequirements).toEqual([
            { type: 'single', filter: requiredEmpty },
        ]);
        act(() =>
            result.current.updateDimensionDashboardFilter(
                { ...requiredEmpty, values: ['done'] },
                0,
                false,
                false,
            ),
        );
        expect(result.current.unmetFilterRequirements).toEqual([]);
    });

    it('reports an unmet required group', () => {
        const a = rule('a', 'orders_status', [], { requiredGroupId: 'g' });
        const b = rule('b', 'orders_region', [], { requiredGroupId: 'g' });
        mocks.dashboard = makeDashboard({
            filters: { ...emptyFilters, dimensions: [a, b] },
        });
        const { result } = renderDashboard();
        expect(result.current.unmetFilterRequirements).toEqual([
            { type: 'group', groupId: 'g', filters: [a, b] },
        ]);
    });

    it('ignores temporary filters when computing requirements', () => {
        const requiredEmpty = rule('req', 'orders_status', [], {
            required: true,
        });
        mocks.dashboard = makeDashboard({
            filters: { ...emptyFilters, dimensions: [requiredEmpty] },
        });
        const { result } = renderDashboard();
        act(() =>
            result.current.addDimensionDashboardFilter(
                rule('t', 'orders_status', ['x']),
                true,
            ),
        );
        expect(result.current.unmetFilterRequirements).toHaveLength(1);
    });

    it('excludes requirements on hidden fields no tile offers', () => {
        const requiredHidden = rule('req', 'orders_secret', [], {
            required: true,
        });
        mocks.dashboard = makeDashboard({
            filters: { ...emptyFilters, dimensions: [requiredHidden] },
        });
        const availableFilters: DashboardAvailableFilters = {
            savedQueryFilters: { 'tile-1': [0] },
            savedQueryMetricFilters: {},
            allFilterableFields: [
                {
                    fieldType: 'dimension',
                    type: 'string',
                    name: 'status',
                    table: 'orders',
                    tableLabel: 'Orders',
                    label: 'Status',
                    sql: '',
                    hidden: false,
                } as DashboardAvailableFilters['allFilterableFields'][number],
            ],
            allFilterableMetrics: [],
            hiddenFilterableFieldIds: ['orders_secret'],
        };
        mocks.availableFilters = availableFilters;
        const { result } = renderDashboard();
        expect(result.current.unmetFilterRequirements).toEqual([]);
        cleanup();

        mocks.availableFilters = {
            ...availableFilters,
            hiddenFilterableFieldIds: [],
        };
        const visible = renderDashboard();
        expect(visible.result.current.unmetFilterRequirements).toEqual([
            { type: 'single', filter: requiredHidden },
        ]);
    });
});

describe('filters: direct setters', () => {
    it('setDashboardFilters accepts a value and an updater', () => {
        mocks.dashboard = makeDashboard({ filters: savedFilters });
        const { result } = renderDashboard();
        act(() => result.current.setDashboardFilters(emptyFilters));
        expect(result.current.dashboardFilters).toBe(emptyFilters);
        act(() =>
            result.current.setDashboardFilters((prev) => ({
                ...prev,
                dimensions: [statusFilter],
            })),
        );
        expect(result.current.dashboardFilters.dimensions).toEqual([
            statusFilter,
        ]);
        expect(result.current.haveFiltersChanged).toBe(false);
    });

    it('keeps a fresh empty filters object (only the initial sentinel reloads)', () => {
        mocks.dashboard = makeDashboard({ filters: savedFilters });
        const { result } = renderDashboard();
        act(() =>
            result.current.setDashboardFilters({
                dimensions: [],
                metrics: [],
                tableCalculations: [],
            }),
        );
        expect(result.current.dashboardFilters).toEqual(emptyFilters);
    });

    it('setHaveFiltersChanged and setDashboardTemporaryFilters', () => {
        mocks.dashboard = makeDashboard({ filters: savedFilters });
        const { result } = renderDashboard();
        act(() => result.current.setHaveFiltersChanged(true));
        expect(result.current.haveFiltersChanged).toBe(true);
        act(() => result.current.setHaveFiltersChanged(false));
        expect(result.current.haveFiltersChanged).toBe(false);

        const temp = {
            ...emptyFilters,
            dimensions: [rule('t', 'orders_city', ['x'])],
        };
        act(() => result.current.setDashboardTemporaryFilters(temp));
        expect(result.current.dashboardTemporaryFilters).toEqual(temp);
        act(() =>
            result.current.setDashboardTemporaryFilters((prev) => ({
                ...prev,
                dimensions: [],
            })),
        );
        expect(result.current.dashboardTemporaryFilters).toEqual(emptyFilters);

        // original filters are the loaded dashboard's, not settable state
        expect(result.current.originalDashboardFilters).toBe(savedFilters);
    });
});

describe('filters: embedded dashboards', () => {
    const embedDashboard = (
        interactivity: InteractivityOptions['dashboardFiltersInteractivity'],
    ): Dashboard & InteractivityOptions => ({
        ...makeDashboard({ filters: savedFilters }),
        dashboardFiltersInteractivity: interactivity,
    });

    it.each([
        ['missing interactivity', undefined, emptyFilters],
        ['none', { enabled: FilterInteractivityValues.none }, emptyFilters],
        [
            'some',
            {
                enabled: FilterInteractivityValues.some,
                allowedFilters: ['saved-region'],
            },
            { ...savedFilters, dimensions: [regionFilter] },
        ],
        ['all', { enabled: FilterInteractivityValues.all }, savedFilters],
        ['true', { enabled: true }, savedFilters],
    ])('applies interactivity %s on load', (_, interactivity, expected) => {
        const { result } = renderDashboard(undefined, {
            loadLikeDashboardPage: false,
        });
        act(() =>
            result.current.setEmbedDashboard(embedDashboard(interactivity)),
        );
        expect(result.current.dashboardFilters).toEqual(expected);
        expect(result.current.originalDashboardFilters).toBe(savedFilters);
    });

    it('reset respects interactivity', () => {
        const { result } = renderDashboard(undefined, {
            loadLikeDashboardPage: false,
        });
        act(() =>
            result.current.setEmbedDashboard(
                embedDashboard({
                    enabled: FilterInteractivityValues.some,
                    allowedFilters: ['saved-status'],
                }),
            ),
        );
        act(() =>
            result.current.addDimensionDashboardFilter(regionFilter, false),
        );
        act(() => result.current.resetDashboardFilters());
        expect(result.current.dashboardFilters).toEqual({
            ...savedFilters,
            dimensions: [statusFilter],
        });
    });

    it('dispatches FilterChanged on change but not on initial load', () => {
        mocks.dashboard = makeDashboard({ filters: savedFilters });
        const { result } = renderDashboard();
        expect(mocks.dispatchEmbedEvent).not.toHaveBeenCalled();
        act(() =>
            result.current.addDimensionDashboardFilter(
                rule('city', 'orders_city', ['Lisbon']),
                true,
            ),
        );
        expect(mocks.dispatchEmbedEvent).toHaveBeenCalledTimes(1);
        expect(mocks.dispatchEmbedEvent).toHaveBeenCalledWith(
            LightdashEventType.FilterChanged,
            { hasFilters: true, filterCount: 4 },
        );
        act(() => result.current.setDashboardFilters(emptyFilters));
        expect(mocks.dispatchEmbedEvent).toHaveBeenLastCalledWith(
            LightdashEventType.FilterChanged,
            { hasFilters: true, filterCount: 1 },
        );
        act(() => result.current.setDashboardTemporaryFilters(emptyFilters));
        expect(mocks.dispatchEmbedEvent).toHaveBeenLastCalledWith(
            LightdashEventType.FilterChanged,
            { hasFilters: false, filterCount: 0 },
        );
        expect(mocks.dispatchEmbedEvent).toHaveBeenCalledTimes(3);
        act(() =>
            result.current.addDimensionDashboardFilter(
                rule('city', 'orders_city', ['Lisbon']),
                true,
            ),
        );
        // quirk: no event fires when the previous filters were empty
        expect(mocks.dispatchEmbedEvent).toHaveBeenCalledTimes(3);
    });

    it('dispatches one FilterChanged per saved filter edit in view mode', () => {
        mocks.dashboard = makeDashboard({ filters: savedFilters });
        const { result } = renderDashboard();
        act(() =>
            result.current.updateDimensionDashboardFilter(
                { ...statusFilter, values: ['returned'] },
                0,
                false,
                false,
            ),
        );
        // the pre-store provider sent a second, identical event here
        expect(mocks.dispatchEmbedEvent).toHaveBeenCalledTimes(1);
    });

    it('does not dispatch FilterChanged when URL temporary filters load with the dashboard', () => {
        mocks.dashboard = makeDashboard({ filters: savedFilters });
        renderDashboard(
            urlFor('/dashboard/dashboard-uuid', {
                tempFilters: {
                    dimensions: [rule('city', 'orders_city', ['Lisbon'])],
                    metrics: [],
                },
            }),
        );
        expect(mocks.dispatchEmbedEvent).not.toHaveBeenCalled();
    });
});

describe('filters: SDK mode', () => {
    const availableFilters: DashboardAvailableFilters = {
        savedQueryFilters: { 'tile-1': [0], 'tile-2': [0] },
        savedQueryMetricFilters: {},
        allFilterableFields: [
            {
                fieldType: 'dimension',
                type: 'string',
                name: 'status',
                table: 'orders',
                tableLabel: 'Orders',
                label: 'Status',
                sql: '',
                hidden: false,
            } as DashboardAvailableFilters['allFilterableFields'][number],
        ],
        allFilterableMetrics: [],
        hiddenFilterableFieldIds: [],
    };
    const sdkStatus: SdkFilter = {
        model: 'orders',
        field: 'status',
        operator: 'equals',
        value: 'returned',
    };

    const setSdk = (filters: SdkFilter[] | undefined) => {
        mocks.embed = {
            mode: 'sdk',
            filters,
            dispatchEmbedEvent: mocks.dispatchEmbedEvent,
        };
    };

    it('replaces dashboard dimension filters with SDK filters and never writes the URL', () => {
        setSdk([sdkStatus]);
        mocks.availableFilters = availableFilters;
        mocks.dashboard = makeDashboard({ filters: savedFilters });
        const { result } = renderDashboard();
        expect(result.current.dashboardFilters.dimensions).toHaveLength(1);
        expect(result.current.dashboardFilters.dimensions[0]).toMatchObject({
            label: 'status',
            target: { fieldId: 'orders_status', tableName: 'orders' },
            operator: 'equals',
            values: ['returned'],
            tileTargets: {
                'tile-1': { fieldId: 'orders_status', tableName: 'orders' },
                'tile-2': { fieldId: 'orders_status', tableName: 'orders' },
            },
        });
        expect(result.current.dashboardFilters.metrics).toEqual(
            savedFilters.metrics,
        );
        act(() =>
            result.current.addDimensionDashboardFilter(
                rule('city', 'orders_city', ['x']),
                true,
            ),
        );
        expect(result.current.search).toBe('');
    });

    it('keeps locked saved filters and drops SDK filters targeting them', () => {
        const lockedStatus = { ...statusFilter, lockedTabUuids: ['d'] };
        setSdk([sdkStatus]);
        mocks.availableFilters = availableFilters;
        mocks.dashboard = makeDashboard({
            filters: {
                ...savedFilters,
                dimensions: [lockedStatus, regionFilter],
            },
        });
        const { result } = renderDashboard();
        expect(result.current.dashboardFilters.dimensions).toEqual([
            lockedStatus,
        ]);
        expect(mocks.showToastInfo).toHaveBeenCalledTimes(1);
    });

    it('defers SDK filters while filterable fields are unknown', () => {
        setSdk([sdkStatus]);
        mocks.availableFilters = undefined;
        mocks.dashboard = makeDashboard({ filters: savedFilters });
        const { result, rerender } = renderDashboard();
        expect(result.current.dashboardFilters).toEqual(emptyFilters);
        // derived from the dashboard, so known before the SDK filters apply
        expect(result.current.originalDashboardFilters).toBe(savedFilters);
        mocks.availableFilters = availableFilters;
        rerender();
        expect(result.current.dashboardFilters.dimensions[0].values).toEqual([
            'returned',
        ]);
    });

    it('re-applies changed SDK filters while preserving unmanaged filters', () => {
        setSdk([sdkStatus]);
        mocks.availableFilters = availableFilters;
        mocks.dashboard = makeDashboard({ filters: savedFilters });
        const { result, rerender } = renderDashboard();
        const city = rule('city', 'orders_city', ['Lisbon']);
        const count = rule('count', 'orders_count', [5]);
        act(() => {
            result.current.addDimensionDashboardFilter(city, false);
            result.current.addMetricDashboardFilter(count, false);
        });
        setSdk([{ ...sdkStatus, value: 'pending' }]);
        rerender();
        expect(
            result.current.dashboardFilters.dimensions.map((d) => d.values),
        ).toEqual([['pending']]);
        expect(result.current.dashboardFilters.metrics).toEqual([
            revenueMetricFilter,
            count,
        ]);
        // quirk: dimensions are replaced wholesale by locked saved + SDK
        // filters, so only unmanaged metrics/table calcs survive a re-apply
        expect(result.current.dashboardFilters.dimensions).not.toContainEqual(
            city,
        );
    });
});

// ---------------------------------------------------------------------------
// PARAMETERS
// ---------------------------------------------------------------------------

const savedParameters = {
    status: { parameterName: 'status', value: 'Shipped' },
};

describe('parameters: effective values', () => {
    it('resets viewer overrides to saved values in view mode', () => {
        const { result } = renderDashboard();
        act(() => result.current.setSavedParameters(savedParameters));
        act(() => {
            result.current.setParameter('status', 'Cancelled');
            result.current.setParameter('region', 'EU');
        });
        act(() => result.current.clearAllParameters());
        expect(result.current.dashboardParameters).toEqual(savedParameters);
        expect(result.current.parameterValues).toEqual({ status: 'Shipped' });
        expect(result.current.appliedParameterValues).toEqual({
            status: 'Shipped',
        });
        expect(searchParam(result.current.search, 'parameters')).toBeNull();
    });

    it('clears staged values in edit mode while queries still use saved values', () => {
        const { result } = renderDashboard('/dashboard/dashboard-uuid/edit');
        act(() => result.current.setSavedParameters(savedParameters));
        act(() => result.current.setParameter('status', 'Cancelled'));
        act(() => result.current.clearAllParameters());
        expect(result.current.dashboardParameters).toEqual({});
        expect(result.current.parameterValues).toEqual({});
        expect(result.current.appliedParameterValues).toEqual({
            status: 'Shipped',
        });
    });

    it('clears all runtime values when the dashboard has no saved parameters', () => {
        const { result } = renderDashboard();
        act(() => result.current.setParameter('status', 'Cancelled'));
        act(() => result.current.clearAllParameters());
        expect(result.current.dashboardParameters).toEqual({});
        expect(result.current.appliedParameterValues).toEqual({});
    });

    it('stores string, number and array values in parameterValues', () => {
        const { result } = renderDashboard();
        act(() => {
            result.current.setParameter('a', 'x');
            result.current.setParameter('b', 3);
            result.current.setParameter('c', ['p', 'q']);
        });
        expect(result.current.parameterValues).toEqual({
            a: 'x',
            b: 3,
            c: ['p', 'q'],
        });
    });

    it('applies saved values under the current ones', () => {
        const { result } = renderDashboard();
        act(() =>
            result.current.setSavedParameters({
                ...savedParameters,
                region: { parameterName: 'region', value: 'EU' },
            }),
        );
        act(() => result.current.setParameter('region', 'US'));
        expect(result.current.appliedParameterValues).toEqual({
            status: 'Shipped',
            region: 'US',
        });
    });
});

describe('parameters: URL', () => {
    it('initialises parameters from the URL in view mode', () => {
        const { result } = renderDashboard(
            urlFor('/dashboard/dashboard-uuid', {
                parameters: { status: 'Cancelled', limit: 5 },
            }),
        );
        expect(result.current.dashboardParameters).toEqual({
            status: { parameterName: 'status', value: 'Cancelled' },
            limit: { parameterName: 'limit', value: 5 },
        });
        expect(result.current.parameterValues).toEqual({
            status: 'Cancelled',
            limit: 5,
        });
    });

    it('ignores URL parameters in edit mode', () => {
        const { result } = renderDashboard(
            urlFor('/dashboard/dashboard-uuid/edit', {
                parameters: { status: 'Cancelled' },
            }),
        );
        expect(result.current.dashboardParameters).toEqual({});
        expect(result.current.parametersHaveChanged).toBe(false);
        // quirk: the URL param is left in place in edit mode (no sync runs)
        expect(jsonParam(result.current.search, 'parameters')).toEqual({
            status: 'Cancelled',
        });
    });

    it.each([
        ['malformed JSON', '%7Bbroken'],
        ['array', encodeURIComponent('["a"]')],
        ['nested object', encodeURIComponent('{"a":{"b":1}}')],
        ['mixed array', encodeURIComponent('{"a":["x",1]}')],
    ])('warns and ignores a %s parameters param', (_, raw) => {
        const { result } = renderDashboard(
            `/dashboard/dashboard-uuid?parameters=${raw}`,
        );
        expect(mocks.showToastWarning).toHaveBeenCalledWith({
            title: 'Could not restore parameters from URL',
            subtitle:
                'The link appears to be incomplete. Please ask for it to be shared again.',
        });
        expect(result.current.dashboardParameters).toEqual({});
        expect(searchParam(result.current.search, 'parameters')).toBeNull();
    });

    it('keeps only values that differ from saved in the URL', () => {
        const { result } = renderDashboard();
        act(() =>
            result.current.setSavedParameters({
                ...savedParameters,
                region: { parameterName: 'region', value: 'EU' },
            }),
        );
        expect(searchParam(result.current.search, 'parameters')).toBeNull();
        act(() => result.current.setParameter('region', 'US'));
        expect(jsonParam(result.current.search, 'parameters')).toEqual({
            region: 'US',
        });
        act(() => result.current.setParameter('region', 'EU'));
        expect(searchParam(result.current.search, 'parameters')).toBeNull();
    });

    it('does not write parameters to the URL in edit mode', () => {
        const { result } = renderDashboard('/dashboard/dashboard-uuid/edit');
        act(() => result.current.setParameter('region', 'US'));
        expect(result.current.parameterValues).toEqual({ region: 'US' });
        expect(result.current.search).toBe('');
    });

    it('does not write parameters to the URL in sdk mode', () => {
        mocks.embed = {
            mode: 'sdk',
            filters: undefined,
            dispatchEmbedEvent: mocks.dispatchEmbedEvent,
        };
        const { result } = renderDashboard();
        act(() => result.current.setParameter('region', 'US'));
        expect(result.current.parameterValues).toEqual({ region: 'US' });
        expect(result.current.search).toBe('');
    });

    it('does not count an empty URL value as supplying a required parameter', () => {
        const { result } = renderDashboard(
            '/dashboard/dashboard-uuid?parameters=%7B%22status%22%3A%22%22%7D',
        );
        act(() => {
            result.current.addParameterDefinitions({
                status: { label: 'Status' },
            });
            result.current.addParameterReferences('tile', ['status']);
        });
        expect(result.current.parameterValues).toEqual({});
        expect(result.current.missingRequiredParameters).toEqual(['status']);
    });

    it('resolves an empty URL override using the saved dashboard value', () => {
        const { result } = renderDashboard(
            '/dashboard/dashboard-uuid?parameters=%7B%22status%22%3A%22%22%7D',
        );
        act(() => {
            result.current.setSavedParameters(savedParameters);
            result.current.addParameterDefinitions({
                status: { label: 'Status' },
            });
            result.current.addParameterReferences('tile', ['status']);
        });
        expect(result.current.appliedParameterValues).toEqual({
            status: 'Shipped',
        });
        expect(result.current.missingRequiredParameters).toEqual([]);
    });
});

describe('parameters: saved parameters and modes', () => {
    it('view mode merges saved values under URL values on load', () => {
        mocks.dashboard = makeDashboard({
            parameters: {
                ...savedParameters,
                region: { parameterName: 'region', value: 'EU' },
            },
        });
        const { result } = renderDashboard(
            urlFor('/dashboard/dashboard-uuid', {
                parameters: { region: 'US' },
            }),
        );
        expect(result.current.dashboardParameters).toEqual({
            status: { parameterName: 'status', value: 'Shipped' },
            region: { parameterName: 'region', value: 'US' },
        });
        expect(jsonParam(result.current.search, 'parameters')).toEqual({
            region: 'US',
        });
    });

    it('edit mode replaces staged values with saved values', () => {
        const { result } = renderDashboard('/dashboard/dashboard-uuid/edit');
        act(() => result.current.setParameter('region', 'US'));
        act(() => result.current.setSavedParameters(savedParameters));
        expect(result.current.dashboardParameters).toEqual(savedParameters);
    });

    it('view mode keeps current values when saved values change', () => {
        const { result } = renderDashboard();
        act(() => result.current.setParameter('region', 'US'));
        act(() => result.current.setSavedParameters(savedParameters));
        expect(result.current.dashboardParameters).toEqual({
            ...savedParameters,
            region: { parameterName: 'region', value: 'US' },
        });
    });

    it('applies scheduler parameters as saved parameters', () => {
        const { result } = renderDashboard(undefined, {
            schedulerParameters: { status: 'Delivered', n: 2 },
            loadLikeDashboardPage: false,
        });
        expect(result.current.dashboardParameters).toEqual({
            status: { parameterName: 'status', value: 'Delivered' },
            n: { parameterName: 'n', value: 2 },
        });
        expect(result.current.appliedParameterValues).toEqual({
            status: 'Delivered',
            n: 2,
        });
    });

    it('refreshDashboardVersion stores the fresh saved parameters', async () => {
        mocks.dashboard = makeDashboard();
        const fresh = makeDashboard({
            parameters: { status: { parameterName: 'status', value: 'New' } },
        });
        mocks.versionRefresh.mockResolvedValue(fresh);
        const { result } = renderDashboard();
        await act(() => result.current.refreshDashboardVersion());
        expect(result.current.dashboardParameters).toEqual({
            status: { parameterName: 'status', value: 'New' },
        });
        expect(result.current.dashboardTiles).toBe(fresh.tiles);
    });

    it('refreshDashboardVersion keeps state when already up to date', async () => {
        mocks.dashboard = makeDashboard({ parameters: savedParameters });
        mocks.versionRefresh.mockResolvedValue(null);
        const { result } = renderDashboard();
        await act(() => result.current.refreshDashboardVersion());
        expect(result.current.dashboardParameters).toEqual(savedParameters);
    });
});

describe('parameters: setParameter', () => {
    it.each([
        ['empty string', ''],
        ['null', null],
        ['empty array', []],
    ])('view mode falls back to the saved value on %s', (_, emptyValue) => {
        const { result } = renderDashboard();
        act(() => result.current.setSavedParameters(savedParameters));
        act(() => result.current.setParameter('status', 'Cancelled'));
        act(() => result.current.setParameter('status', emptyValue));
        expect(result.current.dashboardParameters).toEqual(savedParameters);
    });

    it.each([
        ['empty string', ''],
        ['null', null],
        ['empty array', []],
    ])('view mode deletes an unsaved key on %s', (_, emptyValue) => {
        const { result } = renderDashboard();
        act(() => result.current.setParameter('region', 'US'));
        act(() => result.current.setParameter('region', emptyValue));
        expect(result.current.dashboardParameters).toEqual({});
    });

    it.each([
        ['empty string', ''],
        ['null', null],
        ['empty array', []],
    ])('edit mode deletes the key on %s', (_, emptyValue) => {
        const { result } = renderDashboard('/dashboard/dashboard-uuid/edit');
        act(() => result.current.setSavedParameters(savedParameters));
        act(() => result.current.setParameter('status', emptyValue));
        expect(result.current.dashboardParameters).toEqual({});
        expect(result.current.appliedParameterValues).toEqual({
            status: 'Shipped',
        });
    });

    it('stores non-empty values with their parameter name', () => {
        const { result } = renderDashboard();
        act(() => result.current.setParameter('ids', [1, 2]));
        expect(result.current.dashboardParameters).toEqual({
            ids: { parameterName: 'ids', value: [1, 2] },
        });
    });
});

describe('parameters: change tracking', () => {
    it('is false with no saved parameters', () => {
        mocks.dashboard = makeDashboard();
        const { result } = renderDashboard();
        expect(result.current.parametersHaveChanged).toBe(false);
    });

    it('becomes true after a dashboard with saved parameters loads', () => {
        mocks.dashboard = makeDashboard({ parameters: savedParameters });
        const { result } = renderDashboard();
        expect(result.current.dashboardParameters).toEqual(savedParameters);
        // quirk: the change effect compares the not-yet-reconciled parameters
        // against the newly saved ones, so loading alone flips the flag
        expect(result.current.parametersHaveChanged).toBe(true);
    });

    it('becomes true after loading saved parameters in edit mode too', () => {
        mocks.dashboard = makeDashboard({ parameters: savedParameters });
        const { result } = renderDashboard('/dashboard/dashboard-uuid/edit');
        expect(result.current.dashboardParameters).toEqual(savedParameters);
        // quirk: same as view mode
        expect(result.current.parametersHaveChanged).toBe(true);
    });

    it('is sticky once set', () => {
        mocks.dashboard = makeDashboard();
        const { result } = renderDashboard();
        act(() => result.current.setParameter('region', 'US'));
        expect(result.current.parametersHaveChanged).toBe(true);
        act(() => result.current.setParameter('region', null));
        expect(result.current.dashboardParameters).toEqual({});
        // quirk: nothing ever resets the flag
        expect(result.current.parametersHaveChanged).toBe(true);
        act(() => result.current.setSavedParameters({}));
        expect(result.current.parametersHaveChanged).toBe(true);
    });
});

describe('parameters: pinning and order', () => {
    it('seeds pinned parameters and order from config', () => {
        mocks.dashboard = makeDashboard({
            config: {
                isDateZoomDisabled: false,
                pinnedParameters: ['status'],
                parameterOrder: ['status', 'region'],
            },
        });
        const { result } = renderDashboard();
        expect(result.current.pinnedParameters).toEqual(['status']);
        expect(result.current.parameterOrder).toEqual(['status', 'region']);
        expect(result.current.havePinnedParametersChanged).toBe(false);
        expect(result.current.hasParameterOrderChanged).toBe(false);
    });

    it('defaults to empty arrays when config has neither', () => {
        mocks.dashboard = makeDashboard({
            config: { isDateZoomDisabled: false },
        });
        const { result } = renderDashboard();
        expect(result.current.pinnedParameters).toEqual([]);
        expect(result.current.parameterOrder).toEqual([]);
    });

    it('toggles pins and flags the change', () => {
        mocks.dashboard = makeDashboard({
            config: { isDateZoomDisabled: false, pinnedParameters: ['a'] },
        });
        const { result } = renderDashboard();
        act(() => result.current.toggleParameterPin('b'));
        expect(result.current.pinnedParameters).toEqual(['a', 'b']);
        expect(result.current.havePinnedParametersChanged).toBe(true);
        act(() => result.current.toggleParameterPin('a'));
        expect(result.current.pinnedParameters).toEqual(['b']);
        act(() => result.current.setHavePinnedParametersChanged(false));
        expect(result.current.havePinnedParametersChanged).toBe(false);
        act(() => result.current.setPinnedParameters(['z']));
        expect(result.current.pinnedParameters).toEqual(['z']);
        expect(result.current.havePinnedParametersChanged).toBe(true);
    });

    it('sets the order and flags the change', () => {
        mocks.dashboard = makeDashboard();
        const { result } = renderDashboard();
        act(() => result.current.setParameterOrder(['b', 'a']));
        expect(result.current.parameterOrder).toEqual(['b', 'a']);
        expect(result.current.hasParameterOrderChanged).toBe(true);
        act(() => result.current.setHasParameterOrderChanged(false));
        expect(result.current.hasParameterOrderChanged).toBe(false);
        expect(result.current.parameterOrder).toEqual(['b', 'a']);
    });
});

describe('parameters: definitions and references', () => {
    it('merges definitions and translates labels', () => {
        const { result } = renderDashboard(undefined, {
            parameterLabelOverrides: { status: { label: 'Estado' } },
        });
        act(() =>
            result.current.addParameterDefinitions({
                status: { label: 'Status' },
            }),
        );
        act(() =>
            result.current.addParameterDefinitions({
                region: { label: 'Region' },
            }),
        );
        expect(result.current.parameterDefinitions).toEqual({
            status: { label: 'Estado' },
            region: { label: 'Region' },
        });
    });

    it('merges project parameter definitions from the query', () => {
        mocks.projectParameters = { status: { label: 'Status' } };
        const { result } = renderDashboard();
        expect(result.current.parameterDefinitions).toEqual({
            status: { label: 'Status' },
        });
    });

    it('aggregates references across tiles and prunes removed tiles', () => {
        mocks.dashboard = makeDashboard();
        const { result } = renderDashboard();
        act(() => {
            result.current.addParameterReferences('tile-1', ['a', 'b']);
            result.current.addParameterReferences('tile-2', ['b', 'c']);
        });
        expect(result.current.dashboardParameterReferences).toEqual(
            new Set(['a', 'b', 'c']),
        );
        expect(result.current.tileParameterReferences).toEqual({
            'tile-1': ['a', 'b'],
            'tile-2': ['b', 'c'],
        });
        act(() => result.current.setDashboardTiles([chartTile('tile-2')]));
        expect(result.current.dashboardParameterReferences).toEqual(
            new Set(['b', 'c']),
        );
        expect(result.current.tileParameterReferences).toEqual({
            'tile-2': ['b', 'c'],
        });
    });

    it('treats a chart saved value as satisfying a required parameter', () => {
        mocks.dashboard = makeDashboard();
        const { result } = renderDashboard();
        act(() => {
            result.current.addParameterDefinitions({
                status: { label: 'Status' },
            });
            result.current.addParameterReferences('tile-1', ['status']);
        });
        expect(result.current.missingRequiredParameters).toEqual(['status']);
        act(() =>
            result.current.setTileChartSavedParameters('tile-1', {
                status: 'Shipped',
            }),
        );
        expect(result.current.missingRequiredParameters).toEqual([]);
        act(() => result.current.setDashboardTiles([chartTile('tile-2')]));
        expect(result.current.missingRequiredParameters).toEqual([]);
    });

    it('treats a definition default as satisfying a required parameter', () => {
        const { result } = renderDashboard();
        act(() => {
            result.current.addParameterDefinitions({
                status: { label: 'Status', default: 'Shipped' },
            });
            result.current.addParameterReferences('tile-1', ['status']);
        });
        expect(result.current.missingRequiredParameters).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// DATE ZOOM
// ---------------------------------------------------------------------------

const zoomConfig = (
    config: Partial<NonNullable<Dashboard['config']>> = {},
): Dashboard['config'] => ({ isDateZoomDisabled: false, ...config });

describe('date zoom: URL', () => {
    it('restores a standard granularity in canonical case', () => {
        mocks.dashboard = makeDashboard();
        const { result } = renderDashboard(
            '/dashboard/dashboard-uuid?dateZoom=week',
        );
        expect(result.current.dateZoomGranularity).toBe('Week');
        expect(searchParam(result.current.search, 'dateZoom')).toBe('week');
    });

    it('restores a custom granularity verbatim', () => {
        mocks.dashboard = makeDashboard();
        const { result } = renderDashboard(
            '/dashboard/dashboard-uuid?dateZoom=fiscal_quarter',
        );
        expect(result.current.dateZoomGranularity).toBe('fiscal_quarter');
        expect(searchParam(result.current.search, 'dateZoom')).toBe(
            'fiscal_quarter',
        );
    });

    it('restores the URL granularity in edit mode too', () => {
        mocks.dashboard = makeDashboard();
        const { result } = renderDashboard(
            '/dashboard/dashboard-uuid/edit?dateZoom=month',
        );
        expect(result.current.dateZoomGranularity).toBe('Month');
    });

    it('writes the granularity lowercased and removes it when cleared', () => {
        mocks.dashboard = makeDashboard();
        const { result } = renderDashboard();
        expect(result.current.dateZoomGranularity).toBeUndefined();
        act(() => result.current.setDateZoomGranularity('Quarter'));
        expect(result.current.dateZoomGranularity).toBe('Quarter');
        expect(searchParam(result.current.search, 'dateZoom')).toBe('quarter');
        act(() => result.current.setDateZoomGranularity(undefined));
        expect(searchParam(result.current.search, 'dateZoom')).toBeNull();
    });

    it('accepts an updater', () => {
        mocks.dashboard = makeDashboard();
        const { result } = renderDashboard(
            '/dashboard/dashboard-uuid?dateZoom=day',
        );
        act(() =>
            result.current.setDateZoomGranularity((previous) =>
                previous === 'Day' ? 'Week' : 'Year',
            ),
        );
        expect(result.current.dateZoomGranularity).toBe('Week');
    });

    it('keeps other params when writing', () => {
        mocks.dashboard = makeDashboard();
        const { result } = renderDashboard(
            urlFor('/dashboard/dashboard-uuid', {
                parameters: { region: 'US' },
            }),
        );
        act(() => result.current.setDateZoomGranularity('Year'));
        expect(searchParam(result.current.search, 'dateZoom')).toBe('year');
        expect(jsonParam(result.current.search, 'parameters')).toEqual({
            region: 'US',
        });
    });

    it('does not write the URL in sdk mode', () => {
        mocks.embed = { ...mocks.embed, mode: 'sdk' };
        mocks.dashboard = makeDashboard();
        const { result } = renderDashboard();
        act(() => result.current.setDateZoomGranularity('Week'));
        expect(result.current.dateZoomGranularity).toBe('Week');
        expect(result.current.search).toBe('');
    });

    it('seeds from the dateZoom prop and writes it to the URL', () => {
        mocks.dashboard = makeDashboard();
        const { result } = renderDashboard(undefined, { dateZoom: 'Month' });
        expect(result.current.dateZoomGranularity).toBe('Month');
        expect(searchParam(result.current.search, 'dateZoom')).toBe('month');
    });

    it('prefers the URL over the dateZoom prop', () => {
        mocks.dashboard = makeDashboard();
        const { result } = renderDashboard(
            '/dashboard/dashboard-uuid?dateZoom=year',
            { dateZoom: 'Month' },
        );
        expect(result.current.dateZoomGranularity).toBe('Year');
        expect(searchParam(result.current.search, 'dateZoom')).toBe('year');
    });
});

describe('date zoom: default granularity', () => {
    it('applies the configured default in view mode', () => {
        mocks.dashboard = makeDashboard({
            config: zoomConfig({ defaultDateZoomGranularity: 'Month' }),
        });
        const { result } = renderDashboard();
        expect(result.current.dateZoomGranularity).toBe('Month');
        expect(searchParam(result.current.search, 'dateZoom')).toBe('month');
    });

    it('lets the URL win over the default', () => {
        mocks.dashboard = makeDashboard({
            config: zoomConfig({ defaultDateZoomGranularity: 'Month' }),
        });
        const { result } = renderDashboard(
            '/dashboard/dashboard-uuid?dateZoom=week',
        );
        expect(result.current.dateZoomGranularity).toBe('Week');
    });

    it('does not apply the default in edit mode', () => {
        mocks.dashboard = makeDashboard({
            config: zoomConfig({ defaultDateZoomGranularity: 'Month' }),
        });
        const { result } = renderDashboard('/dashboard/dashboard-uuid/edit');
        expect(result.current.dateZoomGranularity).toBeUndefined();
    });

    it('does not apply the default when date zoom is disabled', () => {
        mocks.dashboard = makeDashboard({
            config: zoomConfig({
                isDateZoomDisabled: true,
                defaultDateZoomGranularity: 'Month',
            }),
        });
        const { result } = renderDashboard();
        expect(result.current.dateZoomGranularity).toBeUndefined();
    });

    it('applies the default once the dashboard loads after mount', () => {
        const { result, rerender } = renderDashboard();
        expect(result.current.dateZoomGranularity).toBeUndefined();
        mocks.dashboard = makeDashboard({
            config: zoomConfig({ defaultDateZoomGranularity: 'Year' }),
        });
        rerender();
        expect(result.current.dateZoomGranularity).toBe('Year');
    });

    it('stays cleared after the viewer clears the default', () => {
        mocks.dashboard = makeDashboard({
            config: zoomConfig({ defaultDateZoomGranularity: 'Month' }),
        });
        const { result, rerender } = renderDashboard();
        act(() => result.current.setDateZoomGranularity(undefined));
        rerender();
        expect(result.current.dateZoomGranularity).toBeUndefined();
        expect(searchParam(result.current.search, 'dateZoom')).toBeNull();
    });
});

describe('date zoom: allowed granularities', () => {
    it('resets a standard granularity outside the allowed list to the default', () => {
        mocks.dashboard = makeDashboard({
            config: zoomConfig({
                dateZoomGranularities: ['Month', 'Year'],
                defaultDateZoomGranularity: 'Year',
            }),
        });
        const { result } = renderDashboard(
            '/dashboard/dashboard-uuid?dateZoom=day',
        );
        expect(result.current.dateZoomGranularity).toBe('Year');
        expect(searchParam(result.current.search, 'dateZoom')).toBe('year');
    });

    it('clears a disallowed standard granularity when there is no default', () => {
        mocks.dashboard = makeDashboard({
            config: zoomConfig({ dateZoomGranularities: ['Month'] }),
        });
        const { result } = renderDashboard();
        act(() => result.current.setDateZoomGranularity('Day'));
        expect(result.current.dateZoomGranularity).toBeUndefined();
        expect(searchParam(result.current.search, 'dateZoom')).toBeNull();
    });

    it('offers no sub-day granularity by default, so a sub-day URL value is cleared', () => {
        mocks.dashboard = makeDashboard({ config: zoomConfig() });
        const { result } = renderDashboard(
            '/dashboard/dashboard-uuid?dateZoom=hour',
        );
        expect(result.current.dateZoomGranularity).toBeUndefined();
    });

    it('keeps an allowed sub-day granularity from the URL', () => {
        mocks.dashboard = makeDashboard({
            config: zoomConfig({
                dateZoomGranularities: ['Hour', 'Day', 'Month'],
            }),
        });
        const { result } = renderDashboard(
            '/dashboard/dashboard-uuid?dateZoom=hour',
        );
        expect(result.current.dateZoomGranularity).toBe('Hour');
        expect(searchParam(result.current.search, 'dateZoom')).toBe('hour');
    });

    it('keeps an allowed sub-day granularity when the dashboard loads after mount', () => {
        const { result, rerender } = renderDashboard(
            '/dashboard/dashboard-uuid?dateZoom=hour',
        );
        mocks.dashboard = makeDashboard({
            config: zoomConfig({ dateZoomGranularities: ['Hour', 'Day'] }),
        });
        rerender();
        expect(result.current.dateZoomGranularity).toBe('Hour');
    });

    it('resets a disallowed sub-day URL value to the configured default', () => {
        mocks.dashboard = makeDashboard({
            config: zoomConfig({
                dateZoomGranularities: ['Day', 'Month'],
                defaultDateZoomGranularity: 'Month',
            }),
        });
        const { result } = renderDashboard(
            '/dashboard/dashboard-uuid?dateZoom=hour',
        );
        expect(result.current.dateZoomGranularity).toBe('Month');
        expect(searchParam(result.current.search, 'dateZoom')).toBe('month');
    });

    it('keeps a custom granularity while charts are loading', () => {
        mocks.dashboard = makeDashboard({
            config: zoomConfig({ dateZoomGranularities: ['Month'] }),
        });
        const { result } = renderDashboard(
            '/dashboard/dashboard-uuid?dateZoom=fiscal_quarter',
        );
        expect(result.current.dateZoomGranularity).toBe('fiscal_quarter');
    });

    it('resets a stale custom granularity once all charts load', () => {
        mocks.dashboard = makeDashboard({
            config: zoomConfig({ defaultDateZoomGranularity: 'Month' }),
        });
        const { result, rerender } = renderDashboard(
            '/dashboard/dashboard-uuid?dateZoom=fiscal_quarter',
        );
        expect(result.current.dateZoomGranularity).toBe('fiscal_quarter');
        mocks.tileStatus = {
            areAllChartsLoaded: true,
            availableCustomGranularities: {},
        };
        rerender();
        expect(result.current.dateZoomGranularity).toBe('Month');
        expect(searchParam(result.current.search, 'dateZoom')).toBe('month');
    });

    it('keeps an available custom granularity once all charts load', () => {
        mocks.dashboard = makeDashboard();
        const { result, rerender } = renderDashboard(
            '/dashboard/dashboard-uuid?dateZoom=fiscal_quarter',
        );
        act(() => {
            result.current.reportCustomGranularities({
                fiscal_quarter: 'Fiscal quarter',
            });
        });
        mocks.tileStatus = {
            areAllChartsLoaded: true,
            availableCustomGranularities: {},
        };
        rerender();
        expect(result.current.dateZoomGranularity).toBe('fiscal_quarter');
    });
});

describe('date zoom: control granularities', () => {
    it('restores per-control overrides from the URL in canonical case', () => {
        mocks.dashboard = makeDashboard();
        const { result } = renderDashboard(
            '/dashboard/dashboard-uuid?dateZoom.ctrl-1=week&dateZoom.ctrl-2=fiscal_quarter',
        );
        expect(result.current.controlGranularities).toEqual({
            'ctrl-1': 'Week',
            'ctrl-2': 'fiscal_quarter',
        });
        expect(searchParam(result.current.search, 'dateZoom.ctrl-1')).toBe(
            'week',
        );
        expect(searchParam(result.current.search, 'dateZoom.ctrl-2')).toBe(
            'fiscal_quarter',
        );
    });

    it('keeps URL overrides when the dashboard loads after mount', () => {
        const { result, rerender } = renderDashboard(
            '/dashboard/dashboard-uuid?dateZoom.ctrl-1=week',
        );
        mocks.dashboard = makeDashboard();
        rerender();
        expect(result.current.controlGranularities).toEqual({
            'ctrl-1': 'Week',
        });
    });

    it('keeps overrides set before the dashboard loads', () => {
        const { result, rerender } = renderDashboard();
        act(() => result.current.setControlGranularity('ctrl-1', 'Week'));
        mocks.dashboard = makeDashboard();
        rerender();
        // quirk: the override is already in the URL, so the load-time reset skips
        expect(result.current.controlGranularities).toEqual({
            'ctrl-1': 'Week',
        });
        expect(searchParam(result.current.search, 'dateZoom.ctrl-1')).toBe(
            'week',
        );
    });

    it('writes and removes control overrides in the URL', () => {
        mocks.dashboard = makeDashboard();
        const { result } = renderDashboard(
            '/dashboard/dashboard-uuid?dateZoom=day',
        );
        act(() => result.current.setControlGranularity('ctrl-1', 'Month'));
        act(() => result.current.setControlGranularity('ctrl-2', 'Year'));
        expect(result.current.controlGranularities).toEqual({
            'ctrl-1': 'Month',
            'ctrl-2': 'Year',
        });
        expect(searchParam(result.current.search, 'dateZoom.ctrl-1')).toBe(
            'month',
        );
        expect(searchParam(result.current.search, 'dateZoom')).toBe('day');
        act(() => result.current.setControlGranularity('ctrl-1', undefined));
        expect(result.current.controlGranularities).toEqual({
            'ctrl-2': 'Year',
        });
        expect(
            searchParam(result.current.search, 'dateZoom.ctrl-1'),
        ).toBeNull();
        expect(searchParam(result.current.search, 'dateZoom.ctrl-2')).toBe(
            'year',
        );
    });

    it('does not write control overrides to the URL in sdk mode', () => {
        mocks.embed = { ...mocks.embed, mode: 'sdk' };
        mocks.dashboard = makeDashboard();
        const { result } = renderDashboard();
        act(() => result.current.setControlGranularity('ctrl-1', 'Week'));
        expect(result.current.controlGranularities).toEqual({
            'ctrl-1': 'Week',
        });
        expect(result.current.search).toBe('');
    });
});

describe('date zoom: tile reports', () => {
    const fields = [
        { fieldId: 'orders_created', label: 'Created', tableName: 'orders' },
    ];

    it('stores zoomable fields per tile and keeps identity on identical reports', () => {
        mocks.dashboard = makeDashboard();
        const { result } = renderDashboard();
        expect(result.current.chartZoomableFieldsByTileUuid).toEqual({});
        act(() => result.current.setChartZoomableFields('tile-1', fields));
        const first = result.current.chartZoomableFieldsByTileUuid;
        expect(first).toEqual({ 'tile-1': fields });
        act(() => result.current.setChartZoomableFields('tile-1', [...fields]));
        expect(result.current.chartZoomableFieldsByTileUuid).toBe(first);
    });

    it('drops zoomable fields of tiles removed from the dashboard', () => {
        mocks.dashboard = makeDashboard();
        const { result } = renderDashboard();
        act(() => {
            result.current.setChartZoomableFields('tile-1', fields);
            result.current.setChartZoomableFields('tile-2', fields);
        });
        act(() => result.current.setDashboardTiles([chartTile('tile-2')]));
        expect(result.current.chartZoomableFieldsByTileUuid).toEqual({
            'tile-2': fields,
        });
    });

    it('tracks tiles with date zoom applied', () => {
        mocks.dashboard = makeDashboard();
        const { result } = renderDashboard();
        expect(result.current.tilesWithDateZoomApplied).toBeUndefined();
        act(() =>
            result.current.setTilesWithDateZoomApplied(
                (previous) => new Set([...(previous ?? []), 'tile-1']),
            ),
        );
        act(() =>
            result.current.setTilesWithDateZoomApplied(
                (previous) => new Set([...(previous ?? []), 'tile-2']),
            ),
        );
        expect(result.current.tilesWithDateZoomApplied).toEqual(
            new Set(['tile-1', 'tile-2']),
        );
        act(() => result.current.setTilesWithDateZoomApplied(new Set()));
        expect(result.current.tilesWithDateZoomApplied).toEqual(new Set());
    });
});

// ---------------------------------------------------------------------------
// EDIT STATE
// ---------------------------------------------------------------------------

describe('edit state: tiles', () => {
    it('is undefined until the page seeds it from the loaded dashboard', () => {
        mocks.dashboard = makeDashboard();
        const unseeded = renderDashboard(undefined, {
            loadLikeDashboardPage: false,
        });
        expect(unseeded.result.current.dashboardTiles).toBeUndefined();
        unseeded.unmount();

        const { result } = renderDashboard();
        expect(result.current.dashboardTiles).toBe(
            (mocks.dashboard as Dashboard).tiles,
        );
        expect(result.current.haveTilesChanged).toBe(false);
    });

    it('accepts a value and an updater, and tracks the changed flag separately', () => {
        mocks.dashboard = makeDashboard();
        const { result } = renderDashboard();
        const replaced = [chartTile('tile-3')];
        act(() => result.current.setDashboardTiles(replaced));
        expect(result.current.dashboardTiles).toBe(replaced);
        expect(result.current.haveTilesChanged).toBe(false);

        act(() =>
            result.current.setDashboardTiles((previous) => [
                ...(previous ?? []),
                chartTile('tile-4'),
            ]),
        );
        expect(result.current.dashboardTiles?.map((t) => t.uuid)).toEqual([
            'tile-3',
            'tile-4',
        ]);
        act(() => result.current.setHaveTilesChanged(true));
        expect(result.current.haveTilesChanged).toBe(true);
    });

    it('keeps the staged tiles when the dashboard refetches', () => {
        mocks.dashboard = makeDashboard();
        const { result, rerender } = renderDashboard();
        const staged = [chartTile('tile-3')];
        act(() => result.current.setDashboardTiles(staged));
        mocks.dashboard = makeDashboard({ tiles: [chartTile('server')] });
        rerender();
        expect(result.current.dashboardTiles).toBe(staged);
    });

    it('derives filter support from the staged tiles', () => {
        mocks.dashboard = makeDashboard({ tiles: [] });
        const { result } = renderDashboard();
        expect(result.current.hasTilesThatSupportFilters).toBe(false);
        act(() => result.current.setDashboardTiles([chartTile('tile-1')]));
        expect(result.current.hasTilesThatSupportFilters).toBe(true);
    });

    it('refreshDashboardVersion replaces staged tiles and tabs', async () => {
        mocks.dashboard = makeDashboard();
        const fresh = makeDashboard({
            tiles: [chartTile('fresh')],
            tabs: [tabB, tabA],
        });
        mocks.versionRefresh.mockResolvedValue(fresh);
        const { result } = renderDashboard();
        await act(() => result.current.refreshDashboardVersion());
        expect(result.current.dashboardTiles).toBe(fresh.tiles);
        expect(result.current.dashboardTabs).toEqual([tabA, tabB]);
    });
});

describe('edit state: tabs and the active tab', () => {
    it('keeps tabs sorted by order for values and updaters', () => {
        mocks.dashboard = makeDashboard({ tabs: [tabB, tabA] });
        const { result } = renderDashboard();
        expect(result.current.dashboardTabs).toEqual([tabA, tabB]);
        const tabC = { uuid: 'tab-c', name: 'C', order: -1 };
        act(() =>
            result.current.setDashboardTabs((previous) => [
                ...previous,
                tabC,
            ]),
        );
        expect(result.current.dashboardTabs.map((t) => t.uuid)).toEqual([
            'tab-c',
            'tab-a',
            'tab-b',
        ]);
        expect(result.current.haveTabsChanged).toBe(false);
        act(() => result.current.setHaveTabsChanged(true));
        expect(result.current.haveTabsChanged).toBe(true);
    });

    it('starts on the URL tab, else the first tab', () => {
        mocks.dashboard = makeDashboard({ tabs: [tabA, tabB] });
        const fromUrl = renderDashboard('/dashboard/dashboard-uuid/view/tabs/tab-b');
        expect(fromUrl.result.current.activeTab).toEqual(tabB);
        fromUrl.unmount();

        const fallback = renderDashboard(
            '/dashboard/dashboard-uuid/view/tabs/missing',
        );
        expect(fallback.result.current.activeTab).toEqual(tabA);
    });

    it('skips hidden tabs in view mode but not in edit mode', () => {
        const hiddenA = { ...tabA, hidden: true };
        mocks.dashboard = makeDashboard({ tabs: [hiddenA, tabB] });
        const view = renderDashboard('/dashboard/dashboard-uuid/view/tabs/tab-a');
        expect(view.result.current.activeTab).toEqual(tabB);
        view.unmount();

        const edit = renderDashboard('/dashboard/dashboard-uuid/edit/tabs/tab-a');
        expect(edit.result.current.activeTab).toEqual(hiddenA);
    });

    it('setActiveTab switches without marking tabs changed', () => {
        mocks.dashboard = makeDashboard({ tabs: [tabA, tabB] });
        const { result } = renderDashboard();
        act(() => result.current.setActiveTab(tabB));
        expect(result.current.activeTab).toEqual(tabB);
        expect(result.current.haveTabsChanged).toBe(false);
    });

    it('keeps the current tab when it is reordered or renamed', () => {
        mocks.dashboard = makeDashboard({ tabs: [tabA, tabB] });
        const { result } = renderDashboard();
        act(() => result.current.setActiveTab(tabB));
        act(() =>
            result.current.setDashboardTabs([
                { ...tabB, order: 0, name: 'Renamed' },
                { ...tabA, order: 1 },
            ]),
        );
        expect(result.current.activeTab).toEqual({
            ...tabB,
            order: 0,
            name: 'Renamed',
        });
    });

    // Quirk: deleting the active tab leaves it active until something else
    // sets a tab
    it('keeps a deleted active tab active', () => {
        mocks.dashboard = makeDashboard({ tabs: [tabA, tabB] });
        const { result } = renderDashboard();
        act(() => result.current.setActiveTab(tabB));
        act(() => result.current.setDashboardTabs([tabA]));
        expect(result.current.dashboardTabs).toEqual([tabA]);
        expect(result.current.activeTab).toEqual(tabB);
    });

    it('clearing every tab leaves the last active tab in place', () => {
        mocks.dashboard = makeDashboard({ tabs: [tabA, tabB] });
        const { result } = renderDashboard();
        act(() => result.current.setDashboardTabs([]));
        expect(result.current.activeTab).toEqual(tabA);
    });
});

describe('edit state: custom metrics', () => {
    const metric = {
        name: 'total',
        table: 'orders',
        type: 'sum',
        sql: '${TABLE}.amount',
    } as never;
    const other = { ...(metric as object), name: 'other' } as never;

    it('seeds from config and keeps edits while they are flagged', () => {
        mocks.dashboard = makeDashboard({
            config: { isDateZoomDisabled: false, customMetrics: [metric] },
        });
        const { result, rerender } = renderDashboard();
        expect(result.current.dashboardCustomMetrics).toEqual([metric]);
        expect(result.current.haveCustomMetricsChanged).toBe(false);

        act(() => {
            result.current.setDashboardCustomMetrics([metric, other]);
            result.current.setHaveCustomMetricsChanged(true);
        });
        mocks.dashboard = makeDashboard({
            config: { isDateZoomDisabled: false, customMetrics: [] },
        });
        rerender();
        expect(result.current.dashboardCustomMetrics).toEqual([
            metric,
            other,
        ]);

        act(() => result.current.setHaveCustomMetricsChanged(false));
        expect(result.current.dashboardCustomMetrics).toEqual([]);
    });

    it('reseeds unflagged edits when the config changes', () => {
        mocks.dashboard = makeDashboard({
            config: { isDateZoomDisabled: false, customMetrics: [metric] },
        });
        const { result, rerender } = renderDashboard();
        act(() =>
            result.current.setDashboardCustomMetrics((current) => [
                ...current,
                other,
            ]),
        );
        expect(result.current.dashboardCustomMetrics).toEqual([
            metric,
            other,
        ]);
        mocks.dashboard = makeDashboard({
            config: { isDateZoomDisabled: false, customMetrics: [other] },
        });
        rerender();
        expect(result.current.dashboardCustomMetrics).toEqual([other]);
    });
});

describe('edit state: config flags and required filters note', () => {
    it('seeds the disabled flags from config', () => {
        mocks.dashboard = makeDashboard({
            config: { isDateZoomDisabled: true, isAddFilterDisabled: true },
        });
        const { result } = renderDashboard();
        expect(result.current.isDateZoomDisabled).toBe(true);
        expect(result.current.isAddFilterDisabled).toBe(true);
    });

    // Quirk: config can turn the flags on but never back off
    it('does not clear the flags when a refetch turns them off', () => {
        mocks.dashboard = makeDashboard({
            config: { isDateZoomDisabled: true, isAddFilterDisabled: true },
        });
        const { result, rerender } = renderDashboard();
        mocks.dashboard = makeDashboard({
            config: { isDateZoomDisabled: false, isAddFilterDisabled: false },
        });
        rerender();
        expect(result.current.isDateZoomDisabled).toBe(true);
        expect(result.current.isAddFilterDisabled).toBe(true);
    });

    it('lets editors toggle the flags', () => {
        mocks.dashboard = makeDashboard();
        const { result } = renderDashboard();
        expect(result.current.isDateZoomDisabled).toBe(false);
        act(() => {
            result.current.setIsDateZoomDisabled(true);
            result.current.setIsAddFilterDisabled(true);
        });
        expect(result.current.isDateZoomDisabled).toBe(true);
        expect(result.current.isAddFilterDisabled).toBe(true);
    });

    it('prefers an edited note over the saved one until it is cleared', () => {
        mocks.dashboard = makeDashboard({
            config: { isDateZoomDisabled: false, requiredFiltersNote: 'Saved' },
        });
        const { result, rerender } = renderDashboard();
        expect(result.current.requiredFiltersNote).toBe('Saved');
        act(() => result.current.setRequiredFiltersNote('Edited'));
        expect(result.current.requiredFiltersNote).toBe('Edited');
        mocks.dashboard = makeDashboard({
            config: { isDateZoomDisabled: false, requiredFiltersNote: 'New' },
        });
        rerender();
        expect(result.current.requiredFiltersNote).toBe('Edited');
        act(() => result.current.setRequiredFiltersNote(''));
        expect(result.current.requiredFiltersNote).toBe('');
        act(() => result.current.setRequiredFiltersNote(undefined));
        expect(result.current.requiredFiltersNote).toBe('New');
    });

    it('reads the note from an embedded dashboard', () => {
        const { result } = renderDashboard(undefined, {
            loadLikeDashboardPage: false,
        });
        act(() =>
            result.current.setEmbedDashboard({
                ...makeDashboard({
                    config: {
                        isDateZoomDisabled: false,
                        requiredFiltersNote: 'Embed note',
                    },
                }),
                dashboardFiltersInteractivity: {
                    enabled: FilterInteractivityValues.all,
                },
            } as Dashboard & InteractivityOptions),
        );
        expect(result.current.requiredFiltersNote).toBe('Embed note');
    });
});

describe('edit state: date zoom settings', () => {
    const control = { uuid: 'c1', name: 'Zoom', granularity: 'MONTH' };
    const zoomConfig = {
        controls: [control],
        tileTargets: {
            'tile-1': { controlUuid: 'c1', fieldId: 'f', tableName: 't' },
        },
    };
    const withConfig = (config: Partial<Dashboard['config']>) =>
        makeDashboard({
            config: { isDateZoomDisabled: false, ...config },
        });

    it('seeds the control config and replaces it on edit', () => {
        mocks.dashboard = withConfig({ dateZoomConfig: zoomConfig });
        const { result } = renderDashboard();
        expect(result.current.dateZoomConfig).toEqual(zoomConfig);
        expect(result.current.hasDateZoomConfigChanged).toBe(false);
        const edited = { controls: [], tileTargets: {} };
        act(() => result.current.setDateZoomConfig(edited));
        expect(result.current.dateZoomConfig).toBe(edited);
        expect(result.current.hasDateZoomConfigChanged).toBe(true);
        act(() => result.current.setHasDateZoomConfigChanged(false));
        expect(result.current.dateZoomConfig).toBe(edited);
        expect(result.current.hasDateZoomConfigChanged).toBe(false);
    });

    it('defaults to an empty config', () => {
        mocks.dashboard = makeDashboard();
        const { result } = renderDashboard();
        expect(result.current.dateZoomConfig).toEqual({
            controls: [],
            tileTargets: {},
        });
    });

    it('keeps an edit through a refetch of equal content', () => {
        mocks.dashboard = withConfig({ dateZoomConfig: zoomConfig });
        const { result, rerender } = renderDashboard();
        const edited = { controls: [], tileTargets: {} };
        act(() => result.current.setDateZoomConfig(edited));
        mocks.dashboard = withConfig({
            dateZoomConfig: structuredClone(zoomConfig),
        });
        rerender();
        expect(result.current.dateZoomConfig).toBe(edited);
        expect(result.current.hasDateZoomConfigChanged).toBe(true);
    });

    it('replaces an edit and clears its flag when the saved config changes', () => {
        mocks.dashboard = withConfig({ dateZoomConfig: zoomConfig });
        const { result, rerender } = renderDashboard();
        act(() =>
            result.current.setDateZoomConfig({ controls: [], tileTargets: {} }),
        );
        const saved = { ...zoomConfig, controls: [{ ...control, name: 'New' }] };
        mocks.dashboard = withConfig({ dateZoomConfig: saved });
        rerender();
        expect(result.current.dateZoomConfig).toEqual(saved);
        expect(result.current.hasDateZoomConfigChanged).toBe(false);
    });

    it('offers every standard granularity except sub-day ones by default', () => {
        mocks.dashboard = makeDashboard();
        const { result } = renderDashboard();
        expect(result.current.dateZoomGranularities).toEqual(
            Object.values(DateGranularity).filter(
                (g) => !isSubDayGranularity(g),
            ),
        );
        expect(result.current.defaultDateZoomGranularity).toBeUndefined();
    });

    it('seeds granularities from config and flags edits', () => {
        mocks.dashboard = withConfig({
            dateZoomGranularities: [DateGranularity.DAY, DateGranularity.HOUR],
            defaultDateZoomGranularity: DateGranularity.DAY,
        });
        const { result } = renderDashboard();
        expect(result.current.dateZoomGranularities).toEqual([
            DateGranularity.DAY,
            DateGranularity.HOUR,
        ]);
        expect(result.current.defaultDateZoomGranularity).toBe(
            DateGranularity.DAY,
        );
        act(() => {
            result.current.setDateZoomGranularities([DateGranularity.WEEK]);
            result.current.setDefaultDateZoomGranularity(DateGranularity.WEEK);
        });
        expect(result.current.dateZoomGranularities).toEqual([
            DateGranularity.WEEK,
        ]);
        expect(result.current.haveDateZoomGranularitiesChanged).toBe(true);
        expect(result.current.defaultDateZoomGranularity).toBe(
            DateGranularity.WEEK,
        );
        expect(result.current.hasDefaultDateZoomGranularityChanged).toBe(true);
        act(() => {
            result.current.setHaveDateZoomGranularitiesChanged(false);
            result.current.setHasDefaultDateZoomGranularityChanged(false);
        });
        expect(result.current.haveDateZoomGranularitiesChanged).toBe(false);
        expect(result.current.hasDefaultDateZoomGranularityChanged).toBe(false);
        expect(result.current.dateZoomGranularities).toEqual([
            DateGranularity.WEEK,
        ]);
    });

    // Quirk: a changed saved list replaces the edit but the flag stays set
    it('replaces granularity edits when the saved values change, keeping the flags', () => {
        mocks.dashboard = withConfig({
            dateZoomGranularities: [DateGranularity.DAY],
            defaultDateZoomGranularity: DateGranularity.DAY,
        });
        const { result, rerender } = renderDashboard();
        act(() => {
            result.current.setDateZoomGranularities([DateGranularity.WEEK]);
            result.current.setDefaultDateZoomGranularity(DateGranularity.WEEK);
        });
        mocks.dashboard = withConfig({
            dateZoomGranularities: [DateGranularity.MONTH],
            defaultDateZoomGranularity: DateGranularity.MONTH,
        });
        rerender();
        expect(result.current.dateZoomGranularities).toEqual([
            DateGranularity.MONTH,
        ]);
        expect(result.current.defaultDateZoomGranularity).toBe(
            DateGranularity.MONTH,
        );
        expect(result.current.haveDateZoomGranularitiesChanged).toBe(true);
        expect(result.current.hasDefaultDateZoomGranularityChanged).toBe(true);
    });

    it('keeps granularity edits through a refetch with the same saved values', () => {
        const granularities = [DateGranularity.DAY];
        mocks.dashboard = withConfig({
            dateZoomGranularities: granularities,
            defaultDateZoomGranularity: DateGranularity.DAY,
        });
        const { result, rerender } = renderDashboard();
        act(() => {
            result.current.setDateZoomGranularities([DateGranularity.WEEK]);
            result.current.setDefaultDateZoomGranularity(undefined);
        });
        mocks.dashboard = withConfig({
            dateZoomGranularities: granularities,
            defaultDateZoomGranularity: DateGranularity.DAY,
        });
        rerender();
        expect(result.current.dateZoomGranularities).toEqual([
            DateGranularity.WEEK,
        ]);
        expect(result.current.defaultDateZoomGranularity).toBeUndefined();
    });

    it('prunes stale custom granularities from an edited list once charts load', () => {
        mocks.dashboard = makeDashboard();
        mocks.tileStatus.areAllChartsLoaded = true;
        const { result } = renderDashboard();
        act(() => {
            result.current.setDateZoomGranularities([
                DateGranularity.DAY,
                'fiscal_quarter',
            ]);
            result.current.setHaveDateZoomGranularitiesChanged(false);
        });
        // The cleanup runs on tile reports, not on edits
        expect(result.current.dateZoomGranularities).toEqual([
            DateGranularity.DAY,
            'fiscal_quarter',
        ]);
        act(() =>
            result.current.reportCustomGranularities({ fiscal_year: 'FY' }),
        );
        expect(result.current.dateZoomGranularities).toEqual([
            DateGranularity.DAY,
        ]);
        expect(result.current.haveDateZoomGranularitiesChanged).toBe(true);
    });
});

describe('edit state: setters', () => {
    it('keeps setter identities across edits', () => {
        mocks.dashboard = makeDashboard({ tabs: [tabA, tabB] });
        const { result } = renderDashboard();
        const setterNames = [
            'setDashboardTiles',
            'setHaveTilesChanged',
            'setDashboardTabs',
            'setHaveTabsChanged',
            'setActiveTab',
            'setDashboardCustomMetrics',
            'setHaveCustomMetricsChanged',
            'setIsDateZoomDisabled',
            'setIsAddFilterDisabled',
            'setRequiredFiltersNote',
            'setDateZoomConfig',
            'setHasDateZoomConfigChanged',
            'setDateZoomGranularities',
            'setHaveDateZoomGranularitiesChanged',
            'setDefaultDateZoomGranularity',
            'setHasDefaultDateZoomGranularityChanged',
        ] as const;
        const before = setterNames.map((name) => result.current[name]);
        act(() => {
            result.current.setDashboardTiles([chartTile('tile-9')]);
            result.current.setHaveTilesChanged(true);
            result.current.setDashboardTabs([tabB]);
            result.current.setActiveTab(tabB);
            result.current.setDateZoomConfig({ controls: [], tileTargets: {} });
            result.current.setDateZoomGranularities([DateGranularity.DAY]);
            result.current.setRequiredFiltersNote('note');
        });
        expect(setterNames.map((name) => result.current[name])).toEqual(
            before,
        );
    });
});

describe('edit state: multiple dashboards', () => {
    it('keeps each mounted dashboard draft separate', () => {
        mocks.dashboard = makeDashboard({ tabs: [tabA, tabB] });
        const first = renderDashboard();
        const second = renderDashboard();
        act(() => {
            first.result.current.setDashboardTiles([chartTile('only-first')]);
            first.result.current.setHaveTilesChanged(true);
            first.result.current.setActiveTab(tabB);
            first.result.current.setDateZoomGranularities([DateGranularity.DAY]);
        });
        expect(second.result.current.dashboardTiles).toBe(
            (mocks.dashboard as Dashboard).tiles,
        );
        expect(second.result.current.haveTilesChanged).toBe(false);
        expect(second.result.current.activeTab).toEqual(tabA);
        expect(second.result.current.haveDateZoomGranularitiesChanged).toBe(
            false,
        );
    });
});
