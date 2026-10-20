import {
    DashboardTileTypes,
    FilterOperator,
    type ChartZoomableField,
    type Dashboard,
    type DashboardFilterRule,
    type DashboardTab,
    type DashboardTile,
} from '@lightdash/common';
import { act, cleanup, render } from '@testing-library/react';
import {
    memo,
    Profiler,
    useEffect,
    type ProfilerOnRenderCallback,
    type ReactNode,
} from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    selectChartZoomableFieldsByTileUuid,
    selectControlGranularities,
    selectDashboardFilters,
    selectDateZoomGranularity,
    selectIsDateZoomAppliedToTile,
    selectDashboardParameters,
    selectHaveFiltersChanged,
    selectMissingRequiredParameters,
    selectParameterOrder,
    selectParametersHaveChanged,
    selectParameterValues,
    selectPinnedParameters,
    useDashboardAllFilters,
    useDashboardSelector,
    useDashboardTemporaryFilters,
} from '../../features/dashboard/store';
import DashboardProvider from './DashboardProvider';
import useDashboardContext from './useDashboardContext';

const mocks = vi.hoisted(() => ({
    dashboard: undefined as unknown,
    toaster: { showToastWarning: () => {}, showToastInfo: () => {} },
    embed: { mode: 'direct', filters: undefined, dispatchEmbedEvent: () => {} },
}));

vi.mock('../../ee/providers/Embed/useEmbed', () => ({
    default: () => mocks.embed,
}));
vi.mock('../../hooks/dashboard/useDashboard', () => ({
    useDashboardQuery: () => ({
        data: mocks.dashboard,
        isInitialLoading: false,
        error: null,
    }),
    useDashboardVersionRefresh: () => ({ mutateAsync: vi.fn() }),
    useDashboardsAvailableFilters: () => ({ data: undefined }),
}));
vi.mock('../../hooks/toaster/useToaster', () => ({
    default: () => mocks.toaster,
}));
vi.mock('../../features/comments', () => ({
    useGetComments: () => ({ data: undefined }),
}));
vi.mock('../../features/parameters', () => ({
    useParameters: () => ({ data: undefined }),
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
// ---------------------------------------------------------------------------

const useWholeContext = () => useDashboardContext((c) => c);
const useTileState = (tileUuid: string) => ({
    tiles: useDashboardContext((c) => c.dashboardTiles),
    activeTab: useDashboardContext((c) => c.activeTab),
    dateZoomGranularity: useDashboardSelector(selectDateZoomGranularity),
    controlGranularities: useDashboardSelector(selectControlGranularities),
    isDateZoomApplied: useDashboardSelector((state) =>
        selectIsDateZoomAppliedToTile(state, tileUuid),
    ),
});
const useDateZoomControlState = () => ({
    dateZoomGranularity: useDashboardSelector(selectDateZoomGranularity),
    chartZoomableFieldsByTileUuid: useDashboardSelector(
        selectChartZoomableFieldsByTileUuid,
    ),
});
const useFilterBarState = () => useDashboardAllFilters();
const useParameterBarState = () => ({
    parameterValues: useDashboardSelector(selectParameterValues),
    missing: useDashboardSelector(selectMissingRequiredParameters),
});
const usePageState = () => ({
    dashboardFilters: useDashboardSelector(selectDashboardFilters),
    dashboardTemporaryFilters: useDashboardTemporaryFilters(),
    haveFiltersChanged: useDashboardSelector(selectHaveFiltersChanged),
    parametersHaveChanged: useDashboardSelector(selectParametersHaveChanged),
    parameterValues: useDashboardSelector(selectParameterValues),
    dashboardParameters: useDashboardSelector(selectDashboardParameters),
    pinnedParameters: useDashboardSelector(selectPinnedParameters),
    parameterOrder: useDashboardSelector(selectParameterOrder),
});
type Actions = {
    updateDimensionDashboardFilter: (
        item: DashboardFilterRule,
        index: number,
        isTemporary: boolean,
        isInEditMode: boolean,
    ) => void;
    addDimensionDashboardFilter: (
        filter: DashboardFilterRule,
        isTemporary: boolean,
    ) => void;
    setParameter: (key: string, value: string) => void;
    toggleParameterPin: (key: string) => void;
    setDateZoomGranularity: (granularity: string | undefined) => void;
    setControlGranularity: (
        controlUuid: string,
        granularity: string | undefined,
    ) => void;
    setChartZoomableFields: (
        tileUuid: string,
        fields: ChartZoomableField[],
    ) => void;
    setTilesWithDateZoomApplied: (
        update: (previous: Set<string> | undefined) => Set<string>,
    ) => void;
    setDashboardTiles: (
        update: (previous: DashboardTile[] | undefined) => DashboardTile[],
    ) => void;
    setHaveTilesChanged: (changed: boolean) => void;
    setActiveTab: (tab: DashboardTab) => void;
    setDateZoomGranularities: (granularities: string[]) => void;
};
const useActions = (): Actions => ({
    updateDimensionDashboardFilter: useDashboardContext(
        (c) => c.updateDimensionDashboardFilter,
    ),
    addDimensionDashboardFilter: useDashboardContext(
        (c) => c.addDimensionDashboardFilter,
    ),
    setParameter: useDashboardContext((c) => c.setParameter),
    toggleParameterPin: useDashboardContext((c) => c.toggleParameterPin),
    setDateZoomGranularity: useDashboardContext(
        (c) => c.setDateZoomGranularity,
    ),
    setControlGranularity: useDashboardContext((c) => c.setControlGranularity),
    setChartZoomableFields: useDashboardContext(
        (c) => c.setChartZoomableFields,
    ),
    setTilesWithDateZoomApplied: useDashboardContext(
        (c) => c.setTilesWithDateZoomApplied,
    ),
    setDashboardTiles: useDashboardContext((c) => c.setDashboardTiles),
    setHaveTilesChanged: useDashboardContext((c) => c.setHaveTilesChanged),
    setActiveTab: useDashboardContext((c) => c.setActiveTab),
    setDateZoomGranularities: useDashboardContext(
        (c) => c.setDateZoomGranularities,
    ),
});

const DashboardPageLoader = () => {
    const dashboard = useDashboardContext((c) => c.dashboard);
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const setDashboardTiles = useDashboardContext((c) => c.setDashboardTiles);
    const setDashboardTabs = useDashboardContext((c) => c.setDashboardTabs);
    const setSavedParameters = useDashboardContext((c) => c.setSavedParameters);
    useEffect(() => {
        if (dashboardTiles) return;
        setDashboardTiles(dashboard?.tiles ?? []);
        setDashboardTabs(dashboard?.tabs ?? []);
        setSavedParameters(dashboard?.parameters ?? {});
    }, [
        dashboard,
        dashboardTiles,
        setDashboardTiles,
        setDashboardTabs,
        setSavedParameters,
    ]);
    return null;
};

const Wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={['/dashboard/dashboard-uuid']}>
        <Routes>
            <Route
                path="/dashboard/:dashboardUuid/:mode?"
                element={
                    <DashboardProvider projectUuid="project-uuid">
                        <DashboardPageLoader />
                        {children}
                    </DashboardProvider>
                }
            />
        </Routes>
    </MemoryRouter>
);

// ---------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------

const TILE_COUNT = 20;

type Counts = {
    wholeContextConsumer: number;
    tiles: number;
    filterBar: number;
    parameterBar: number;
    dateZoomControl: number;
    page: number;
};
const counts: Counts = {
    wholeContextConsumer: 0,
    tiles: 0,
    filterBar: 0,
    parameterBar: 0,
    dateZoomControl: 0,
    page: 0,
};
let actualDuration = 0;
let actions: Actions | undefined;

const resetCounters = () => {
    (Object.keys(counts) as (keyof Counts)[]).forEach((key) => {
        counts[key] = 0;
    });
    actualDuration = 0;
};

const WholeContextProbe = memo(() => {
    useWholeContext();
    counts.wholeContextConsumer += 1;
    return null;
});
const TileProbe = memo(({ index }: { index: number }) => {
    useTileState(`tile-${index}`);
    counts.tiles += 1;
    return <span data-index={index} />;
});
const FilterBarProbe = memo(() => {
    useFilterBarState();
    counts.filterBar += 1;
    return null;
});
const ParameterBarProbe = memo(() => {
    useParameterBarState();
    counts.parameterBar += 1;
    return null;
});
const DateZoomControlProbe = memo(() => {
    useDateZoomControlState();
    counts.dateZoomControl += 1;
    return null;
});
const PageProbe = memo(() => {
    usePageState();
    counts.page += 1;
    return null;
});
const ActionsProbe = memo(() => {
    actions = useActions();
    return null;
});

const onRender: ProfilerOnRenderCallback = (_id, _phase, duration) => {
    actualDuration += duration;
};

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const chartTile = (uuid: string): DashboardTile => ({
    uuid,
    type: DashboardTileTypes.SAVED_CHART,
    x: 0,
    y: 0,
    w: 6,
    h: 3,
    tabUuid: undefined,
    properties: {
        savedChartUuid: `chart-${uuid}`,
        title: uuid,
        belongsToDashboard: false,
    },
});

const dimensionFilters: DashboardFilterRule[] = Array.from(
    { length: 6 },
    (_, i) => ({
        id: `filter-${i}`,
        label: undefined,
        target: { fieldId: `orders_field_${i}`, tableName: 'orders' },
        operator: FilterOperator.EQUALS,
        values: [`value-${i}`],
    }),
);

const benchmarkDashboard: Dashboard = {
    organizationUuid: 'org-uuid',
    projectUuid: 'project-uuid',
    dashboardVersionId: 1,
    versionUuid: 'version-uuid',
    uuid: 'dashboard-uuid',
    name: 'Benchmark',
    verification: null,
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    tiles: Array.from({ length: TILE_COUNT }, (_, i) => chartTile(`tile-${i}`)),
    filters: {
        dimensions: dimensionFilters,
        metrics: [],
        tableCalculations: [],
    },
    parameters: Object.fromEntries(
        ['p0', 'p1', 'p2', 'p3'].map((key) => [
            key,
            { parameterName: key, value: `${key}-saved` },
        ]),
    ),
    config: { isDateZoomDisabled: false, pinnedParameters: ['p0'] },
    spaceUuid: 'space-uuid',
    spaceName: 'Space',
    views: 0,
    firstViewedAt: null,
    pinnedListUuid: null,
    pinnedListOrder: null,
    tabs: [],
    inheritsFromOrgOrProject: false,
    access: null,
    slug: 'benchmark',
    colorPaletteUuid: null,
    owner: null,
};

const mountBenchmark = () => {
    mocks.dashboard = benchmarkDashboard;
    render(
        <Profiler id="dashboard" onRender={onRender}>
            <Wrapper>
                <ActionsProbe />
                <WholeContextProbe />
                {Array.from({ length: TILE_COUNT }, (_, i) => (
                    <TileProbe key={i} index={i} />
                ))}
                <FilterBarProbe />
                <ParameterBarProbe />
                <DateZoomControlProbe />
                <PageProbe />
            </Wrapper>
        </Profiler>,
    );
    resetCounters();
};

const getActions = () => {
    if (!actions) throw new Error('actions probe did not render');
    return actions;
};

const scenarios: Record<string, () => void> = {
    'update one dimension filter': () =>
        act(() =>
            getActions().updateDimensionDashboardFilter(
                { ...dimensionFilters[0], values: ['changed'] },
                0,
                false,
                false,
            ),
        ),
    'add a temporary filter': () =>
        act(() =>
            getActions().addDimensionDashboardFilter(
                {
                    ...dimensionFilters[1],
                    id: 'temporary',
                    values: ['temporary'],
                },
                true,
            ),
        ),
    'set one parameter': () =>
        act(() => getActions().setParameter('p1', 'p1-changed')),
    'toggle a parameter pin': () =>
        act(() => getActions().toggleParameterPin('p2')),
    'set the date zoom granularity': () =>
        act(() => getActions().setDateZoomGranularity('Week')),
    'set a date zoom control granularity': () =>
        act(() => getActions().setControlGranularity('control-1', 'Month')),
    'every tile reports its zoomable fields': () => {
        for (let i = 0; i < TILE_COUNT; i += 1) {
            act(() =>
                getActions().setChartZoomableFields(`tile-${i}`, [
                    {
                        fieldId: 'orders_created',
                        label: 'Created',
                        tableName: 'orders',
                    },
                ]),
            );
        }
    },
    'every tile reports date zoom applied': () => {
        for (let i = 0; i < TILE_COUNT; i += 1) {
            act(() =>
                getActions().setTilesWithDateZoomApplied(
                    (previous) => new Set([...(previous ?? []), `tile-${i}`]),
                ),
            );
        }
    },
    // handleUpdateTiles on drag or resize stop: one tile moves
    'drop one dragged tile': () =>
        act(() => {
            getActions().setDashboardTiles((previous) =>
                (previous ?? []).map((tile) =>
                    tile.uuid === 'tile-0' ? { ...tile, x: 6, y: 3 } : tile,
                ),
            );
            getActions().setHaveTilesChanged(true);
        }),
    'switch the active tab': () =>
        act(() =>
            getActions().setActiveTab({ uuid: 'tab-x', name: 'X', order: 0 }),
        ),
    'edit the allowed date zoom granularities': () =>
        act(() => getActions().setDateZoomGranularities(['Day', 'Week'])),
    '10 rapid filter updates': () => {
        for (let i = 0; i < 10; i += 1) {
            act(() =>
                getActions().updateDimensionDashboardFilter(
                    { ...dimensionFilters[0], values: [`rapid-${i}`] },
                    0,
                    false,
                    false,
                ),
            );
        }
    },
};

const results: Record<string, Counts & { actualDurationMs: number }> = {};

afterEach(() => {
    cleanup();
    actions = undefined;
});

describe('dashboard render benchmark', () => {
    it.each(Object.keys(scenarios))('%s', (name) => {
        mountBenchmark();
        scenarios[name]();
        results[name] = {
            ...counts,
            actualDurationMs: Number(actualDuration.toFixed(2)),
        };
    });

    it('matches the render-count baseline', () => {
        // eslint-disable-next-line no-console
        console.table(results);
        const renderCounts = Object.fromEntries(
            Object.entries(results).map(
                ([name, { actualDurationMs, ...c }]) => [name, c],
            ),
        );
        expect(renderCounts).toEqual(BASELINE);
    });
});

// Filter, parameter and date zoom state comes from the dashboard store, so
// tiles only re-render for the state they read and for the router update a URL
// write causes (the context provider re-ran every consumer on each of its 1-3
// renders per edit, and once per tile report while tiles loaded).
const BASELINE: Record<string, Counts> = {
    'update one dimension filter': {
        wholeContextConsumer: 1,
        tiles: TILE_COUNT,
        filterBar: 2,
        parameterBar: 0,
        dateZoomControl: 0,
        page: 2,
    },
    'add a temporary filter': {
        wholeContextConsumer: 1,
        tiles: TILE_COUNT,
        filterBar: 2,
        parameterBar: 0,
        dateZoomControl: 0,
        page: 2,
    },
    'set one parameter': {
        wholeContextConsumer: 1,
        tiles: TILE_COUNT,
        filterBar: 1,
        parameterBar: 1,
        dateZoomControl: 0,
        page: 2,
    },
    'toggle a parameter pin': {
        wholeContextConsumer: 0,
        tiles: 0,
        filterBar: 0,
        parameterBar: 0,
        dateZoomControl: 0,
        page: 1,
    },
    'set the date zoom granularity': {
        wholeContextConsumer: 1,
        tiles: 2 * TILE_COUNT,
        filterBar: 1,
        parameterBar: 0,
        dateZoomControl: 1,
        page: 1,
    },
    'set a date zoom control granularity': {
        wholeContextConsumer: 1,
        tiles: 2 * TILE_COUNT,
        filterBar: 1,
        parameterBar: 0,
        dateZoomControl: 0,
        page: 1,
    },
    'every tile reports its zoomable fields': {
        wholeContextConsumer: 0,
        tiles: 0,
        filterBar: 0,
        parameterBar: 0,
        dateZoomControl: TILE_COUNT,
        page: 0,
    },
    'every tile reports date zoom applied': {
        wholeContextConsumer: 0,
        tiles: TILE_COUNT,
        filterBar: 0,
        parameterBar: 0,
        dateZoomControl: 0,
        page: 0,
    },
    'drop one dragged tile': {
        wholeContextConsumer: 1,
        tiles: TILE_COUNT,
        filterBar: 1,
        parameterBar: 0,
        dateZoomControl: 0,
        page: 1,
    },
    'switch the active tab': {
        wholeContextConsumer: 1,
        tiles: TILE_COUNT,
        filterBar: 1,
        parameterBar: 0,
        dateZoomControl: 0,
        page: 1,
    },
    'edit the allowed date zoom granularities': {
        wholeContextConsumer: 1,
        tiles: TILE_COUNT,
        filterBar: 1,
        parameterBar: 0,
        dateZoomControl: 0,
        page: 1,
    },
    '10 rapid filter updates': {
        wholeContextConsumer: 10,
        tiles: 10 * TILE_COUNT,
        filterBar: 20,
        parameterBar: 0,
        dateZoomControl: 0,
        page: 20,
    },
};
