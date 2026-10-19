import {
    DashboardTileTypes,
    FilterInteractivityValues,
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
    selectAppliedParameterValues,
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
            areAllChartsLoaded: false,
            availableCustomGranularities: {},
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

const useHarness = () => ({
    ...useDashboardContext((context) => context),
    ...useStoreValues(),
    search: useLocation().search,
});

type ProviderOptions = {
    schedulerParameters?: ParametersValuesMap;
    parameterLabelOverrides?: LanguageMap['parameters'];
    projectUuid?: string;
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
