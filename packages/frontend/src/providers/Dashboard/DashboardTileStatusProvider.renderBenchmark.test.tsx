import {
    DashboardTileTypes,
    type CacheMetadata,
    type DashboardTile,
} from '@lightdash/common';
import { act, cleanup, render } from '@testing-library/react';
import {
    memo,
    Profiler,
    type ProfilerOnRenderCallback,
    type ReactNode,
} from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDashboardTestStore } from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import DashboardTileStatusProvider from './DashboardTileStatusProvider';
import useDashboardTileStatusContext from './useDashboardTileStatusContext';

vi.mock('./useDashboardContext', () => ({
    default: (selector: (context: Record<string, unknown>) => unknown) =>
        selector({ projectUuid: 'project-uuid' }),
}));
vi.mock('../App/useApp', () => ({
    default: () => ({ health: { data: undefined } }),
}));
vi.mock('../../ee/providers/Embed/useEmbed', () => ({
    default: () => ({
        embedToken: undefined,
        dispatchEmbedEvent: vi.fn(),
        isEmbedEventReady: false,
    }),
}));
vi.mock('../../hooks/dashboard/useDashboardPreAggregateAudit', () => ({
    useDashboardPreAggregateAudit: () => ({ data: undefined }),
}));

// ---------------------------------------------------------------------------
// ADAPTER: the only section that should change when the state source moves.
// Each probe reads what the real component reads.
// ---------------------------------------------------------------------------

// DashboardChartTile + useDashboardChartReadyQuery
const useChartTileState = () => ({
    invalidateCache: useDashboardTileStatusContext((c) => c.invalidateCache),
    isAutoRefresh: useDashboardTileStatusContext((c) => c.isAutoRefresh),
    preAggregateStatuses: useDashboardTileStatusContext(
        (c) => c.preAggregateStatuses,
    ),
});
// pages/Dashboard.tsx
const usePageState = () => ({
    areAllChartsLoaded: useDashboardTileStatusContext(
        (c) => c.areAllChartsLoaded,
    ),
    oldestCacheTime: useDashboardTileStatusContext((c) => c.oldestCacheTime),
    preAggregateStatuses: useDashboardTileStatusContext(
        (c) => c.preAggregateStatuses,
    ),
});
// DateZoom and the filter bar
const useBarState = () => ({
    availableCustomGranularities: useDashboardTileStatusContext(
        (c) => c.availableCustomGranularities,
    ),
    sqlChartTilesMetadata: useDashboardTileStatusContext(
        (c) => c.sqlChartTilesMetadata,
    ),
});
type Actions = {
    markTileLoaded: (tileUuid: string) => void;
    addResultsCacheTime: (cacheMetadata?: CacheMetadata) => void;
    addAvailableCustomGranularities: (
        granularities: Record<string, string>,
    ) => void;
    markTileScreenshotReady: (tileUuid: string) => void;
};
const useActions = (): Actions => ({
    markTileLoaded: useDashboardTileStatusContext((c) => c.markTileLoaded),
    addResultsCacheTime: useDashboardTileStatusContext(
        (c) => c.addResultsCacheTime,
    ),
    addAvailableCustomGranularities: useDashboardTileStatusContext(
        (c) => c.addAvailableCustomGranularities,
    ),
    markTileScreenshotReady: useDashboardTileStatusContext(
        (c) => c.markTileScreenshotReady,
    ),
});

// ---------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------

const TILE_COUNT = 20;

type Counts = { tiles: number; page: number; bars: number };
const counts: Counts = { tiles: 0, page: 0, bars: 0 };
let actualDuration = 0;
let actions: Actions | undefined;

const resetCounters = () => {
    counts.tiles = 0;
    counts.page = 0;
    counts.bars = 0;
    actualDuration = 0;
};

const TileProbe = memo(({ index }: { index: number }) => {
    useChartTileState();
    counts.tiles += 1;
    return <span data-index={index} />;
});
const PageProbe = memo(() => {
    usePageState();
    counts.page += 1;
    return null;
});
const BarProbe = memo(() => {
    useBarState();
    counts.bars += 1;
    return null;
});
const ActionsProbe = memo(() => {
    actions = useActions();
    return null;
});

const onRender: ProfilerOnRenderCallback = (_id, _phase, duration) => {
    actualDuration += duration;
};

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
const tiles = Array.from({ length: TILE_COUNT }, (_, i) =>
    chartTile(`tile-${i}`),
);

const Wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={['/dashboard/dashboard-uuid']}>
        <DashboardStoreTestProvider store={createDashboardTestStore()}>
            <DashboardTileStatusProvider
                dashboardTiles={tiles}
                dashboardTabs={[]}
                activeTab={undefined}
            >
                {children}
            </DashboardTileStatusProvider>
        </DashboardStoreTestProvider>
    </MemoryRouter>
);

const mountBenchmark = () => {
    render(
        <Profiler id="tile-status" onRender={onRender}>
            <Wrapper>
                <ActionsProbe />
                {tiles.map((_, i) => (
                    <TileProbe key={i} index={i} />
                ))}
                <PageProbe />
                <BarProbe />
            </Wrapper>
        </Profiler>,
    );
    resetCounters();
};

const getActions = () => {
    if (!actions) throw new Error('actions probe did not render');
    return actions;
};

const cacheMetadata = (minute: number): CacheMetadata => ({
    cacheHit: true,
    cacheUpdatedTime: new Date(
        `2026-01-01T00:${String(minute).padStart(2, '0')}:00Z`,
    ),
});

// One tile settling the way DashboardChartTile and its query hook report it
const reportTileLoaded = (index: number) => {
    const tileUuid = `tile-${index}`;
    act(() => getActions().addAvailableCustomGranularities({}));
    act(() => getActions().addResultsCacheTime(cacheMetadata(index)));
    act(() => getActions().markTileLoaded(tileUuid));
    act(() => getActions().markTileScreenshotReady(tileUuid));
};

const scenarios: Record<string, () => void> = {
    'every tile loads': () => {
        for (let i = 0; i < TILE_COUNT; i += 1) reportTileLoaded(i);
    },
    'every tile reloads after a filter change': () => {
        for (let i = 0; i < TILE_COUNT; i += 1) reportTileLoaded(i);
        resetCounters();
        for (let i = 0; i < TILE_COUNT; i += 1) reportTileLoaded(i);
    },
};

const results: Record<string, Counts & { actualDurationMs: number }> = {};

afterEach(() => {
    cleanup();
    actions = undefined;
});

describe('tile status render benchmark', () => {
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

// Every tile report re-renders the provider, and use-context-selector re-runs
// every consumer, so tiles re-render for reports that change nothing they read.
const BASELINE: Record<string, Counts> = {
    'every tile loads': {
        tiles: 22 * TILE_COUNT,
        page: 22,
        bars: 22,
    },
    'every tile reloads after a filter change': {
        tiles: TILE_COUNT * TILE_COUNT,
        page: TILE_COUNT,
        bars: TILE_COUNT,
    },
};
