import {
    DashboardTileTypes,
    FilterOperator,
    type CacheMetadata,
    type DashboardTab,
    type DashboardTile,
} from '@lightdash/common';
import { act, cleanup, renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LightdashEventType } from '../../ee/features/embed/events/types';
import {
    dashboardFiltersActions,
    selectAvailableCustomGranularities,
    selectInvalidateCache,
    selectIsAutoRefresh,
    selectOldestCacheTime,
    selectRefreshCounter,
    selectSqlChartTilesMetadata,
    useAreAllChartsLoaded,
    useDashboardSelector,
    useScreenshotReadiness,
} from '../../features/dashboard/store';
import { createDashboardTestStore } from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import DashboardTileStatusProvider, {
    type DashboardTileStatusProviderProps,
} from './DashboardTileStatusProvider';
import useDashboardTileStatusContext from './useDashboardTileStatusContext';

const mocks = vi.hoisted(() => ({
    embed: {
        embedToken: undefined as string | undefined,
        dispatchEmbedEvent: vi.fn((_type: string, _payload?: unknown) => true),
        isEmbedEventReady: true,
    },
    preAggregatesEnabled: true,
    auditData: undefined as unknown,
    auditArgs: [] as unknown[],
    toStatuses: vi.fn(),
}));

vi.mock('./useDashboardContext', () => ({
    default: (selector: (context: Record<string, unknown>) => unknown) =>
        selector({
            projectUuid: 'project-uuid',
            dashboard: { uuid: 'dashboard-uuid' },
        }),
}));
vi.mock('../App/useApp', () => ({
    default: () => ({
        health: {
            data: { preAggregates: { enabled: mocks.preAggregatesEnabled } },
        },
    }),
}));
vi.mock('../../ee/providers/Embed/useEmbed', () => ({
    default: () => mocks.embed,
}));
vi.mock('../../hooks/dashboard/useDashboardPreAggregateAudit', () => ({
    useDashboardPreAggregateAudit: (args: unknown) => {
        mocks.auditArgs.push(args);
        return { data: mocks.auditData };
    },
    auditResponseToTileStatuses: mocks.toStatuses,
}));

// ---------------------------------------------------------------------------
// ADAPTER: the only section that should change when the state source moves.
// ---------------------------------------------------------------------------

const useHarness = () => ({
    ...useDashboardTileStatusContext((context) => context),
    areAllChartsLoaded: useAreAllChartsLoaded(),
    oldestCacheTime: useDashboardSelector(selectOldestCacheTime),
    invalidateCache: useDashboardSelector(selectInvalidateCache),
    refreshCounter: useDashboardSelector(selectRefreshCounter),
    isAutoRefresh: useDashboardSelector(selectIsAutoRefresh),
    sqlChartTilesMetadata: useDashboardSelector(selectSqlChartTilesMetadata),
    availableCustomGranularities: useDashboardSelector(
        selectAvailableCustomGranularities,
    ),
    ...useScreenshotReadiness(),
});

type Props = Omit<DashboardTileStatusProviderProps, 'children'> & {
    defaultInvalidateCache?: boolean;
};

const renderStatus = (
    initialProps: Props,
    path = '/projects/p/dashboards/dashboard-uuid/view',
) => {
    const store = createDashboardTestStore({
        invalidateCache: initialProps.defaultInvalidateCache,
    });
    let currentProps = initialProps;
    const Wrapper = ({ children }: { children: ReactNode }) => (
        <MemoryRouter initialEntries={[path]}>
            <DashboardStoreTestProvider store={store}>
                <DashboardTileStatusProvider
                    dashboardTiles={currentProps.dashboardTiles}
                    dashboardTabs={currentProps.dashboardTabs}
                    activeTab={currentProps.activeTab}
                    schedulerTabsSelected={currentProps.schedulerTabsSelected}
                >
                    {children}
                </DashboardTileStatusProvider>
            </DashboardStoreTestProvider>
        </MemoryRouter>
    );
    const result = renderHook(() => useHarness(), { wrapper: Wrapper });
    return {
        ...result,
        store,
        setProps: (props: Partial<Props>) => {
            currentProps = { ...currentProps, ...props };
            result.rerender();
        },
    };
};

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const chartTile = (
    uuid: string,
    tabUuid?: string,
    title: string | undefined = uuid,
    chartName?: string,
): DashboardTile => ({
    uuid,
    type: DashboardTileTypes.SAVED_CHART,
    x: 0,
    y: 0,
    w: 6,
    h: 3,
    tabUuid,
    properties: {
        savedChartUuid: `chart-${uuid}`,
        title,
        chartName,
        belongsToDashboard: false,
    },
});
const sqlTile = (uuid: string, tabUuid?: string): DashboardTile => ({
    uuid,
    type: DashboardTileTypes.SQL_CHART,
    x: 0,
    y: 0,
    w: 6,
    h: 3,
    tabUuid,
    properties: { savedSqlUuid: `sql-${uuid}`, chartName: `SQL ${uuid}` },
});
const markdownTile = (uuid: string, tabUuid?: string): DashboardTile => ({
    uuid,
    type: DashboardTileTypes.MARKDOWN,
    x: 0,
    y: 0,
    w: 6,
    h: 3,
    tabUuid,
    properties: { title: '', content: 'Note' },
});

const tabA: DashboardTab = { uuid: 'tab-a', name: 'A', order: 0 };
const tabB: DashboardTab = { uuid: 'tab-b', name: 'B', order: 1 };
const hiddenTab: DashboardTab = {
    uuid: 'tab-hidden',
    name: 'Hidden',
    order: 2,
    hidden: true,
};

const hit = (iso: string): CacheMetadata => ({
    cacheHit: true,
    cacheUpdatedTime: new Date(iso),
});

const noTabs = { dashboardTabs: [], activeTab: undefined };

beforeEach(() => {
    mocks.embed = {
        embedToken: undefined,
        dispatchEmbedEvent: vi.fn((_type: string, _payload?: unknown) => true),
        isEmbedEventReady: true,
    };
    mocks.preAggregatesEnabled = true;
    mocks.auditData = undefined;
    mocks.auditArgs = [];
    mocks.toStatuses.mockReset();
});

afterEach(() => {
    cleanup();
});

// ---------------------------------------------------------------------------
// LOADING
// ---------------------------------------------------------------------------

describe('tile status: all charts loaded', () => {
    it('is false while tiles are unknown', () => {
        const { result } = renderStatus({
            dashboardTiles: undefined,
            ...noTabs,
        });
        expect(result.current.areAllChartsLoaded).toBe(false);
    });

    it('is true for a dashboard without saved chart tiles', () => {
        const { result } = renderStatus({
            dashboardTiles: [markdownTile('m'), sqlTile('s')],
            ...noTabs,
        });
        expect(result.current.areAllChartsLoaded).toBe(true);
    });

    it('waits for every saved chart tile', () => {
        const { result } = renderStatus({
            dashboardTiles: [chartTile('a'), chartTile('b'), sqlTile('s')],
            ...noTabs,
        });
        act(() => result.current.markTileLoaded('a'));
        expect(result.current.areAllChartsLoaded).toBe(false);
        act(() => result.current.markTileLoaded('a'));
        expect(result.current.areAllChartsLoaded).toBe(false);
        act(() => result.current.markTileLoaded('b'));
        expect(result.current.areAllChartsLoaded).toBe(true);
    });

    it('is false with tabs but no active tab', () => {
        const { result } = renderStatus({
            dashboardTiles: [chartTile('a')],
            dashboardTabs: [tabA],
            activeTab: undefined,
        });
        act(() => result.current.markTileLoaded('a'));
        expect(result.current.areAllChartsLoaded).toBe(false);
    });

    it('only waits for tiles on the active tab and tiles without a tab', () => {
        const { result, setProps } = renderStatus({
            dashboardTiles: [
                chartTile('on-a', 'tab-a'),
                chartTile('on-b', 'tab-b'),
                chartTile('orphan'),
            ],
            dashboardTabs: [tabA, tabB],
            activeTab: tabA,
        });
        act(() => result.current.markTileLoaded('on-a'));
        expect(result.current.areAllChartsLoaded).toBe(false);
        act(() => result.current.markTileLoaded('orphan'));
        expect(result.current.areAllChartsLoaded).toBe(true);
        setProps({ activeTab: tabB });
        expect(result.current.areAllChartsLoaded).toBe(false);
        act(() => result.current.markTileLoaded('on-b'));
        expect(result.current.areAllChartsLoaded).toBe(true);
    });

    it('waits for tiles without a tab only on the first tab, where they render', () => {
        const { result } = renderStatus({
            dashboardTiles: [
                chartTile('on-a', 'tab-a'),
                chartTile('on-b', 'tab-b'),
                chartTile('orphan'),
            ],
            dashboardTabs: [tabA, tabB],
            activeTab: tabB,
        });
        expect(result.current.areAllChartsLoaded).toBe(false);
        act(() => result.current.markTileLoaded('on-b'));
        expect(result.current.areAllChartsLoaded).toBe(true);
    });

    it('forgets loaded tiles on refresh', () => {
        const { result } = renderStatus({
            dashboardTiles: [chartTile('a')],
            ...noTabs,
        });
        act(() => result.current.markTileLoaded('a'));
        expect(result.current.areAllChartsLoaded).toBe(true);
        act(() => result.current.clearCacheAndFetch());
        expect(result.current.areAllChartsLoaded).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// CACHE AND REFRESH
// ---------------------------------------------------------------------------

describe('tile status: cache and refresh', () => {
    it('tracks the oldest cache hit time', () => {
        const { result } = renderStatus({
            dashboardTiles: [chartTile('a')],
            ...noTabs,
        });
        expect(result.current.oldestCacheTime).toBeUndefined();
        act(() => result.current.addResultsCacheTime(undefined));
        act(() =>
            result.current.addResultsCacheTime({
                cacheHit: false,
                cacheUpdatedTime: new Date('2026-01-01T00:00:00Z'),
            }),
        );
        act(() =>
            result.current.addResultsCacheTime({
                cacheHit: true,
                cacheUpdatedTime: undefined,
            }),
        );
        expect(result.current.oldestCacheTime).toBeUndefined();
        act(() =>
            result.current.addResultsCacheTime(hit('2026-01-02T00:00:00Z')),
        );
        act(() =>
            result.current.addResultsCacheTime(hit('2026-01-03T00:00:00Z')),
        );
        expect(result.current.oldestCacheTime).toEqual(
            new Date('2026-01-02T00:00:00Z'),
        );
        act(() =>
            result.current.addResultsCacheTime(hit('2026-01-01T00:00:00Z')),
        );
        expect(result.current.oldestCacheTime).toEqual(
            new Date('2026-01-01T00:00:00Z'),
        );
    });

    it('refresh clears the cache time, invalidates the cache and bumps the counter', () => {
        const { result } = renderStatus({
            dashboardTiles: [chartTile('a')],
            ...noTabs,
        });
        expect(result.current.invalidateCache).toBe(false);
        expect(result.current.refreshCounter).toBe(0);
        act(() =>
            result.current.addResultsCacheTime(hit('2026-01-02T00:00:00Z')),
        );
        act(() => result.current.clearCacheAndFetch());
        expect(result.current.oldestCacheTime).toBeUndefined();
        expect(result.current.invalidateCache).toBe(true);
        expect(result.current.refreshCounter).toBe(1);
        act(() => result.current.clearCacheAndFetch());
        expect(result.current.invalidateCache).toBe(true);
        expect(result.current.refreshCounter).toBe(2);
    });

    it('seeds invalidateCache from defaultInvalidateCache', () => {
        const { result } = renderStatus({
            dashboardTiles: [],
            ...noTabs,
            defaultInvalidateCache: true,
        });
        expect(result.current.invalidateCache).toBe(true);
    });

    it('toggles auto refresh', () => {
        const { result } = renderStatus({ dashboardTiles: [], ...noTabs });
        expect(result.current.isAutoRefresh).toBe(false);
        act(() => result.current.setIsAutoRefresh(true));
        expect(result.current.isAutoRefresh).toBe(true);
        act(() => result.current.setIsAutoRefresh(false));
        expect(result.current.isAutoRefresh).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// TILE REPORTS
// ---------------------------------------------------------------------------

describe('tile status: tile reports', () => {
    it('merges custom granularities by new key only', () => {
        const { result } = renderStatus({ dashboardTiles: [], ...noTabs });
        expect(result.current.availableCustomGranularities).toEqual({});
        act(() =>
            result.current.addAvailableCustomGranularities({
                fiscal_quarter: 'Fiscal quarter',
            }),
        );
        const first = result.current.availableCustomGranularities;
        // quirk: an existing key keeps its first label
        act(() =>
            result.current.addAvailableCustomGranularities({
                fiscal_quarter: 'Renamed',
            }),
        );
        expect(result.current.availableCustomGranularities).toBe(first);
        act(() =>
            result.current.addAvailableCustomGranularities({
                fiscal_quarter: 'Renamed',
                fiscal_year: 'Fiscal year',
            }),
        );
        expect(result.current.availableCustomGranularities).toEqual({
            fiscal_quarter: 'Renamed',
            fiscal_year: 'Fiscal year',
        });
    });

    it('stores SQL chart metadata per tile', () => {
        const { result } = renderStatus({ dashboardTiles: [], ...noTabs });
        const columns = [{ reference: 'a', type: 'string' }];
        act(() =>
            result.current.updateSqlChartTilesMetadata('s1', {
                columns,
            } as never),
        );
        act(() =>
            result.current.updateSqlChartTilesMetadata('s2', {
                columns: [],
            } as never),
        );
        expect(result.current.sqlChartTilesMetadata).toEqual({
            s1: { columns },
            s2: { columns: [] },
        });
    });

    it('names tiles by title, then chart name for untitled chart tiles', () => {
        const { result } = renderStatus({
            dashboardTiles: [
                chartTile('titled', undefined, 'Revenue'),
                chartTile('untitled', undefined, '', 'Saved chart'),
                chartTile('nameless', undefined, ''),
                markdownTile('note'),
            ],
            ...noTabs,
        });
        expect(result.current.tileNamesById).toEqual({
            titled: 'Revenue',
            untitled: 'Saved chart',
            nameless: '',
            note: '',
        });
    });
});

// ---------------------------------------------------------------------------
// SCREENSHOTS
// ---------------------------------------------------------------------------

describe('tile status: screenshot readiness', () => {
    it('is ready immediately when tiles are loaded and none need a screenshot', () => {
        const { result } = renderStatus({
            dashboardTiles: [markdownTile('m')],
            ...noTabs,
        });
        expect(result.current.expectedScreenshotTileUuids).toEqual([]);
        expect(result.current.isReadyForScreenshot).toBe(true);
    });

    it('is not ready while tiles are unknown', () => {
        const { result } = renderStatus({
            dashboardTiles: undefined,
            ...noTabs,
        });
        expect(result.current.isReadyForScreenshot).toBe(false);
    });

    it('expects nothing with tabs but no active tab', () => {
        const { result } = renderStatus({
            dashboardTiles: [chartTile('a', 'tab-a')],
            dashboardTabs: [tabA],
            activeTab: undefined,
        });
        expect(result.current.expectedScreenshotTileUuids).toEqual([]);
        expect(result.current.isReadyForScreenshot).toBe(true);
    });

    it('counts ready and errored tiles on the active tab', () => {
        const { result } = renderStatus({
            dashboardTiles: [
                chartTile('a', 'tab-a'),
                sqlTile('s', 'tab-a'),
                chartTile('b', 'tab-b'),
                chartTile('orphan'),
            ],
            dashboardTabs: [tabA, tabB],
            activeTab: tabA,
        });
        expect(result.current.expectedScreenshotTileUuids).toEqual([
            'a',
            's',
            'orphan',
        ]);
        act(() => result.current.markTileScreenshotReady('a'));
        act(() => result.current.markTileScreenshotErrored('s'));
        expect(result.current.isReadyForScreenshot).toBe(false);
        expect(result.current.screenshotReadyTilesCount).toBe(1);
        expect(result.current.screenshotErroredTilesCount).toBe(1);
        expect(result.current.screenshotReadyTileUuids).toEqual(['a']);
        expect(result.current.screenshotErroredTileUuids).toEqual(['s']);
        act(() => result.current.markTileScreenshotReady('orphan'));
        expect(result.current.isReadyForScreenshot).toBe(true);
        expect(result.current.expectedScreenshotTilesCount).toBe(3);
    });

    it('expects tiles without a tab only on the first tab', () => {
        const { result } = renderStatus({
            dashboardTiles: [
                chartTile('on-a', 'tab-a'),
                chartTile('on-b', 'tab-b'),
                chartTile('orphan'),
            ],
            dashboardTabs: [tabA, tabB],
            activeTab: tabB,
        });
        expect(result.current.expectedScreenshotTileUuids).toEqual(['on-b']);
        act(() => result.current.markTileScreenshotReady('on-b'));
        expect(result.current.isReadyForScreenshot).toBe(true);
    });

    it('resets readiness when the tiles or the active tab change', () => {
        const tiles = [chartTile('a', 'tab-a'), chartTile('b', 'tab-b')];
        const { result, setProps } = renderStatus({
            dashboardTiles: tiles,
            dashboardTabs: [tabA, tabB],
            activeTab: tabA,
        });
        act(() => result.current.markTileScreenshotReady('a'));
        act(() => result.current.markTileScreenshotErrored('b'));
        expect(result.current.isReadyForScreenshot).toBe(true);
        setProps({ activeTab: tabB });
        expect(result.current.screenshotReadyTilesCount).toBe(0);
        expect(result.current.screenshotErroredTilesCount).toBe(0);
        act(() => result.current.markTileScreenshotReady('b'));
        expect(result.current.isReadyForScreenshot).toBe(true);
        setProps({ dashboardTiles: [...tiles] });
        expect(result.current.screenshotReadyTilesCount).toBe(0);
        expect(result.current.isReadyForScreenshot).toBe(false);
    });

    it('a reloading tile drops back to not ready', () => {
        const { result } = renderStatus({
            dashboardTiles: [chartTile('a')],
            ...noTabs,
        });
        act(() => result.current.markTileScreenshotErrored('a'));
        expect(result.current.isReadyForScreenshot).toBe(true);
        act(() => result.current.markTileScreenshotLoading('a'));
        expect(result.current.isReadyForScreenshot).toBe(false);
        act(() => result.current.markTileScreenshotLoading('a'));
        expect(result.current.screenshotErroredTilesCount).toBe(0);
    });

    it('waits for tiles without a tab in a tab selection without the null sentinel', () => {
        // MinimalDashboard renders them for any selection (isTileInSelectedTabs)
        const { result } = renderStatus({
            dashboardTiles: [
                chartTile('a', 'tab-a'),
                chartTile('b', 'tab-b'),
                chartTile('orphan'),
            ],
            dashboardTabs: [tabA, tabB],
            activeTab: tabA,
            schedulerTabsSelected: ['tab-a'],
        });
        expect(result.current.expectedScreenshotTileUuids).toEqual([
            'a',
            'orphan',
        ]);
    });

    it('uses the scheduler tab selection, orphans riding the null sentinel', () => {
        const { result } = renderStatus({
            dashboardTiles: [
                chartTile('a', 'tab-a'),
                chartTile('b', 'tab-b'),
                chartTile('orphan'),
                markdownTile('m', 'tab-a'),
            ],
            dashboardTabs: [tabA, tabB],
            activeTab: tabA,
            schedulerTabsSelected: ['tab-b', null],
        });
        expect(result.current.expectedScreenshotTileUuids).toEqual([
            'b',
            'orphan',
        ]);
    });
});

// ---------------------------------------------------------------------------
// EMBED LOAD EVENTS
// ---------------------------------------------------------------------------

describe('tile status: embed all tiles loaded event', () => {
    const allTilesLoadedCalls = () =>
        mocks.embed.dispatchEmbedEvent.mock.calls.filter(
            ([type]) => type === LightdashEventType.AllTilesLoaded,
        );

    beforeEach(() => {
        mocks.embed.embedToken = 'embed-token';
    });

    it('fires once when every visible tile completes', () => {
        const { result, setProps } = renderStatus({
            dashboardTiles: [chartTile('a'), markdownTile('m')],
            ...noTabs,
        });
        act(() => result.current.markEmbedTileComplete('a'));
        expect(allTilesLoadedCalls()).toHaveLength(0);
        act(() => result.current.markEmbedTileComplete('m'));
        expect(allTilesLoadedCalls()).toHaveLength(1);
        expect(allTilesLoadedCalls()[0][1]).toMatchObject({ tilesCount: 2 });
        act(() => result.current.markEmbedTileComplete('m'));
        expect(allTilesLoadedCalls()).toHaveLength(1);
        setProps({ dashboardTabs: [] });
        expect(allTilesLoadedCalls()).toHaveLength(1);
    });

    it('counts the active tab and orphans only on the first visible tab', () => {
        const { result, setProps } = renderStatus({
            dashboardTiles: [
                chartTile('on-a', 'tab-a'),
                chartTile('on-b', 'tab-b'),
                chartTile('orphan'),
            ],
            dashboardTabs: [hiddenTab, tabA, tabB],
            activeTab: tabB,
        });
        act(() => result.current.markEmbedTileComplete('on-b'));
        expect(allTilesLoadedCalls()).toHaveLength(1);
        expect(allTilesLoadedCalls()[0][1]).toMatchObject({ tilesCount: 1 });
        setProps({ activeTab: tabA });
        act(() => result.current.markEmbedTileComplete('on-a'));
        expect(allTilesLoadedCalls()).toHaveLength(1);
        act(() => result.current.markEmbedTileComplete('orphan'));
        expect(allTilesLoadedCalls()).toHaveLength(2);
        expect(allTilesLoadedCalls()[1][1]).toMatchObject({ tilesCount: 2 });
    });

    it('starts a new cycle on refresh and on filter changes', () => {
        const { result, store } = renderStatus({
            dashboardTiles: [chartTile('a')],
            ...noTabs,
        });
        act(() => result.current.markEmbedTileComplete('a'));
        expect(allTilesLoadedCalls()).toHaveLength(1);
        act(() => result.current.clearCacheAndFetch());
        expect(allTilesLoadedCalls()).toHaveLength(1);
        act(() => result.current.markEmbedTileComplete('a'));
        expect(allTilesLoadedCalls()).toHaveLength(2);
        act(() => {
            store.dispatch(
                dashboardFiltersActions.setTemporaryFilters({
                    dimensions: [
                        {
                            id: 'temp',
                            label: undefined,
                            target: {
                                fieldId: 'orders_status',
                                tableName: 'orders',
                            },
                            operator: FilterOperator.EQUALS,
                            values: ['x'],
                        },
                    ],
                    metrics: [],
                    tableCalculations: [],
                }),
            );
        });
        expect(allTilesLoadedCalls()).toHaveLength(2);
        act(() => result.current.markEmbedTileComplete('a'));
        expect(allTilesLoadedCalls()).toHaveLength(3);
    });

    it('waits until the event emitter is ready', () => {
        mocks.embed.isEmbedEventReady = false;
        const { result } = renderStatus({
            dashboardTiles: [chartTile('a')],
            ...noTabs,
        });
        act(() => result.current.markEmbedTileComplete('a'));
        expect(allTilesLoadedCalls()).toHaveLength(0);
    });

    it('retries while dispatch reports failure', () => {
        mocks.embed.dispatchEmbedEvent = vi.fn(
            (_type: string, _payload?: unknown) => false,
        );
        const { result, setProps } = renderStatus({
            dashboardTiles: [chartTile('a')],
            ...noTabs,
        });
        act(() => result.current.markEmbedTileComplete('a'));
        expect(allTilesLoadedCalls()).toHaveLength(1);
        mocks.embed.dispatchEmbedEvent.mockReturnValue(true);
        setProps({ dashboardTabs: [] });
        expect(allTilesLoadedCalls()).toHaveLength(2);
    });

    it('changes markEmbedTileComplete with the load cycle, so settled tiles re-report', () => {
        const { result, setProps } = renderStatus({
            dashboardTiles: [chartTile('a')],
            ...noTabs,
        });
        const first = result.current.markEmbedTileComplete;
        setProps({ dashboardTiles: [chartTile('a'), chartTile('b')] });
        expect(result.current.markEmbedTileComplete).not.toBe(first);
    });

    it('keeps markEmbedTileComplete stable outside embeds', () => {
        mocks.embed.embedToken = undefined;
        const { result, setProps } = renderStatus({
            dashboardTiles: [chartTile('a')],
            ...noTabs,
        });
        const first = result.current.markEmbedTileComplete;
        setProps({ dashboardTiles: [chartTile('a'), chartTile('b')] });
        expect(result.current.markEmbedTileComplete).toBe(first);
    });

    it('ignores tile completion outside embeds', () => {
        mocks.embed.embedToken = undefined;
        const { result } = renderStatus({
            dashboardTiles: [chartTile('a')],
            ...noTabs,
        });
        act(() => result.current.markEmbedTileComplete('a'));
        expect(mocks.embed.dispatchEmbedEvent).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// PRE-AGGREGATES
// ---------------------------------------------------------------------------

describe('tile status: pre-aggregate statuses', () => {
    const lastAuditArgs = () =>
        mocks.auditArgs[mocks.auditArgs.length - 1] as Record<string, unknown>;

    it('maps the audit with tile names', () => {
        const statuses = { a: { tileUuid: 'a' } };
        mocks.auditData = { tabs: [] };
        mocks.toStatuses.mockReturnValue(statuses);
        const { result } = renderStatus({
            dashboardTiles: [chartTile('a', undefined, 'Revenue')],
            ...noTabs,
        });
        expect(result.current.preAggregateStatuses).toBe(statuses);
        expect(mocks.toStatuses).toHaveBeenCalledWith(
            { tabs: [] },
            { a: 'Revenue' },
        );
        expect(lastAuditArgs()).toMatchObject({
            projectUuid: 'project-uuid',
            dashboardUuid: 'dashboard-uuid',
            enabled: true,
        });
    });

    it('keeps the statuses when tiles only move', () => {
        mocks.auditData = { tabs: [] };
        mocks.toStatuses.mockImplementation(() => ({ a: { tileUuid: 'a' } }));
        const tiles = [chartTile('a', undefined, 'Revenue')];
        const { result, setProps } = renderStatus({
            dashboardTiles: tiles,
            ...noTabs,
        });
        const statuses = result.current.preAggregateStatuses;
        setProps({ dashboardTiles: [{ ...tiles[0], x: 6, y: 3 }] });
        expect(result.current.preAggregateStatuses).toBe(statuses);
        setProps({
            dashboardTiles: [chartTile('a', undefined, 'Renamed')],
        });
        expect(result.current.preAggregateStatuses).not.toBe(statuses);
    });

    it('is empty without audit data', () => {
        const { result } = renderStatus({ dashboardTiles: [], ...noTabs });
        expect(result.current.preAggregateStatuses).toEqual({});
    });

    it.each([
        ['embedded', () => (mocks.embed.embedToken = 'token'), undefined],
        ['minimal page', () => {}, '/minimal/projects/p/dashboards/d'],
        [
            'pre-aggregates off',
            () => (mocks.preAggregatesEnabled = false),
            undefined,
        ],
    ])('does not audit when %s', (_, arrange, path) => {
        arrange();
        renderStatus({ dashboardTiles: [], ...noTabs }, path);
        expect(lastAuditArgs()).toMatchObject({ enabled: false });
    });
});
