import {
    DashboardTileTypes,
    FilterOperator,
    NotFoundError,
    PreAggregateMissReason,
    preAggregateUtils,
    TileIneligibleReason,
    type Account,
    type Dashboard,
    type DashboardFilterRule,
    type Explore,
    type MetricQuery,
    type SavedChart,
} from '@lightdash/common';
import { PreAggregateStrategy } from './PreAggregateStrategy';

// --- Fixtures ---

const account = { user: { userUuid: 'u-1' } } as unknown as Account;
const projectUuid = 'p-1';
const dashboardUuid = 'd-1';

const makeTile = (partial: Partial<Dashboard['tiles'][number]>) =>
    ({
        uuid: 'tile-uuid',
        x: 0,
        y: 0,
        w: 6,
        h: 4,
        tabUuid: null,
        type: DashboardTileTypes.SAVED_CHART,
        properties: {
            title: 'Tile',
            belongsToDashboard: false,
            savedChartUuid: 'c-1',
        },
        ...partial,
    }) as Dashboard['tiles'][number];

const makeDashboard = (partial: Partial<Dashboard>): Dashboard =>
    ({
        uuid: dashboardUuid,
        slug: 'a-dashboard',
        name: 'A dashboard',
        description: '',
        filters: { dimensions: [], metrics: [], tableCalculations: [] },
        tabs: [],
        tiles: [],
        updatedAt: new Date(),
        spaceUuid: 's-1',
        spaceName: 'Space',
        projectUuid,
        organizationUuid: 'o-1',
        pinnedListUuid: null,
        views: 0,
        firstViewedAt: null,
        pinnedListOrder: null,
        ...partial,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any as Dashboard & typeof partial;

const emptyMetricQuery: MetricQuery = {
    exploreName: 'orders',
    dimensions: [],
    metrics: [],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};

const makeExplore = (withPreAggs: boolean): Explore =>
    ({
        name: 'orders',
        tables: {},
        preAggregates: withPreAggs
            ? [{ name: 'orders_daily', dimensions: [], metrics: [] }]
            : [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any as Explore;

// --- Mocks ---

const makeDeps = () => {
    const dashboardModel = {
        getByIdOrSlug: jest.fn<
            Promise<Dashboard>,
            [string, { projectUuid?: string }?]
        >(),
    };
    const savedChartModel = {
        get: jest.fn<
            Promise<SavedChart>,
            [string, undefined?, { projectUuid: string }?]
        >(),
    };
    const projectService = {
        getExplore: jest.fn<Promise<Explore>, [Account, string, string]>(),
    };
    return { dashboardModel, savedChartModel, projectService };
};

const makeStrategy = (deps: ReturnType<typeof makeDeps>) =>
    new PreAggregateStrategy({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...({} as any),
        dashboardModel: deps.dashboardModel,
        savedChartModel: deps.savedChartModel,
        projectService: deps.projectService,
        isEnabled: () => true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

describe('PreAggregateStrategy.auditDashboard', () => {
    it('returns a single null-tab group for a dashboard with no tabs', async () => {
        const deps = makeDeps();
        const dashboard = makeDashboard({ tabs: [], tiles: [] });
        const strategy = makeStrategy(deps);

        const result = await strategy.auditDashboard({
            account,
            projectUuid,
            dashboard,
        });

        expect(result.tabs).toHaveLength(1);
        expect(result.tabs[0].tabUuid).toBeNull();
        expect(result.tabs[0].tabName).toBeNull();
        expect(result.tabs[0].tiles).toEqual([]);
        expect(result.summary).toEqual({
            hitCount: 0,
            missCount: 0,
            ineligibleCount: 0,
        });
    });

    it('marks markdown / loom / heading tiles as NON_CHART_TILE', async () => {
        const deps = makeDeps();
        const dashboard = makeDashboard({
            tiles: [
                makeTile({
                    uuid: 't-md',
                    type: DashboardTileTypes.MARKDOWN,
                    properties: { title: 'MD', content: '' } as never,
                }),
                makeTile({
                    uuid: 't-loom',
                    type: DashboardTileTypes.LOOM,
                    properties: { title: 'Loom', url: '' } as never,
                }),
                makeTile({
                    uuid: 't-h',
                    type: DashboardTileTypes.HEADING,
                    properties: { title: 'H' } as never,
                }),
            ],
        });
        const strategy = makeStrategy(deps);

        const result = await strategy.auditDashboard({
            account,
            projectUuid,
            dashboard,
        });

        const { tiles } = result.tabs[0];
        expect(tiles).toHaveLength(3);
        expect(tiles.every((t) => t.status === 'ineligible')).toBe(true);
        expect(
            tiles.every(
                (t) =>
                    t.status === 'ineligible' &&
                    t.ineligibleReason === TileIneligibleReason.NON_CHART_TILE,
            ),
        ).toBe(true);
        expect(result.summary.ineligibleCount).toBe(3);
    });

    it('marks sql chart tiles as SQL_CHART ineligible', async () => {
        const deps = makeDeps();
        const dashboard = makeDashboard({
            tiles: [
                makeTile({
                    uuid: 't-sql',
                    type: DashboardTileTypes.SQL_CHART,
                    properties: {
                        title: 'SQL',
                        savedSqlUuid: 's-1',
                    } as never,
                }),
            ],
        });
        const strategy = makeStrategy(deps);

        const [tile] = (
            await strategy.auditDashboard({
                account,
                projectUuid,
                dashboard,
            })
        ).tabs[0].tiles;

        expect(tile).toMatchObject({
            status: 'ineligible',
            ineligibleReason: TileIneligibleReason.SQL_CHART,
        });
    });

    it('marks saved-chart tile with missing chart as ORPHANED_CHART', async () => {
        const deps = makeDeps();
        const dashboard = makeDashboard({
            tiles: [makeTile({ uuid: 't-orphan' })],
        });
        deps.savedChartModel.get.mockRejectedValue(new NotFoundError('gone'));
        const strategy = makeStrategy(deps);

        const [tile] = (
            await strategy.auditDashboard({
                account,
                projectUuid,
                dashboard,
            })
        ).tabs[0].tiles;

        expect(tile).toMatchObject({
            status: 'ineligible',
            ineligibleReason: TileIneligibleReason.ORPHANED_CHART,
        });
    });

    it('marks saved-chart tile with missing explore as EXPLORE_RESOLUTION_ERROR', async () => {
        const deps = makeDeps();
        const dashboard = makeDashboard({
            tiles: [makeTile({ uuid: 't-noexp' })],
        });
        deps.savedChartModel.get.mockResolvedValue({
            uuid: 'c-1',
            tableName: 'orders',
            metricQuery: emptyMetricQuery,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        deps.projectService.getExplore.mockRejectedValue(
            new NotFoundError('no explore'),
        );
        const strategy = makeStrategy(deps);

        const [tile] = (
            await strategy.auditDashboard({
                account,
                projectUuid,
                dashboard,
            })
        ).tabs[0].tiles;

        expect(tile).toMatchObject({
            status: 'ineligible',
            ineligibleReason: TileIneligibleReason.EXPLORE_RESOLUTION_ERROR,
        });
    });

    it('returns miss:NO_PRE_AGGREGATES_DEFINED when explore has no pre-aggregates', async () => {
        const deps = makeDeps();
        const dashboard = makeDashboard({
            tiles: [makeTile({ uuid: 't-miss' })],
        });
        deps.savedChartModel.get.mockResolvedValue({
            uuid: 'c-1',
            tableName: 'orders',
            metricQuery: emptyMetricQuery,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        deps.projectService.getExplore.mockResolvedValue(makeExplore(false));
        const strategy = makeStrategy(deps);

        const [tile] = (
            await strategy.auditDashboard({
                account,
                projectUuid,
                dashboard,
            })
        ).tabs[0].tiles;

        expect(tile.status).toBe('miss');
        if (tile.status === 'miss') {
            expect(tile.miss.reason).toBe(
                PreAggregateMissReason.NO_PRE_AGGREGATES_DEFINED,
            );
        }
    });

    it('groups tiles by tab, preserves tab order, and buckets orphan-tabbed tiles under a null-tab entry', async () => {
        const deps = makeDeps();
        const dashboard = makeDashboard({
            tabs: [
                { uuid: 'tab-a', name: 'Alpha', order: 0 } as never,
                { uuid: 'tab-b', name: 'Bravo', order: 1 } as never,
            ],
            tiles: [
                makeTile({
                    uuid: 't-1',
                    tabUuid: 'tab-b',
                    type: DashboardTileTypes.MARKDOWN,
                    properties: { title: 'M', content: '' } as never,
                }),
                makeTile({
                    uuid: 't-2',
                    tabUuid: 'tab-a',
                    type: DashboardTileTypes.MARKDOWN,
                    properties: { title: 'N', content: '' } as never,
                }),
                makeTile({
                    uuid: 't-3',
                    tabUuid: 'tab-gone',
                    type: DashboardTileTypes.MARKDOWN,
                    properties: { title: 'Orph', content: '' } as never,
                }),
            ],
        });
        const strategy = makeStrategy(deps);

        const result = await strategy.auditDashboard({
            account,
            projectUuid,
            dashboard,
        });

        expect(result.tabs.map((t) => t.tabUuid)).toEqual([
            'tab-a',
            'tab-b',
            null,
        ]);
        expect(
            result.tabs.find((t) => t.tabUuid === 'tab-a')!.tiles[0].tileUuid,
        ).toBe('t-2');
        expect(
            result.tabs.find((t) => t.tabUuid === 'tab-b')!.tiles[0].tileUuid,
        ).toBe('t-1');
        expect(
            result.tabs.find((t) => t.tabUuid === null)!.tiles[0].tileUuid,
        ).toBe('t-3');
    });

    it('drops dashboard filter rules whose field is not in the tile explore before calling findMatch', async () => {
        const findMatchSpy = jest.spyOn(preAggregateUtils, 'findMatch');
        try {
            const deps = makeDeps();
            const offExploreFilter: DashboardFilterRule = {
                id: 'f-off',
                target: {
                    fieldId: 'other_browser',
                    tableName: 'other',
                },
                operator: FilterOperator.EQUALS,
                values: ['chrome'],
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any;
            const dashboard = makeDashboard({
                tiles: [makeTile({ uuid: 't-1' })],
                filters: {
                    dimensions: [offExploreFilter],
                    metrics: [],
                    tableCalculations: [],
                },
            });
            deps.savedChartModel.get.mockResolvedValue({
                uuid: 'c-1',
                tableName: 'orders',
                metricQuery: emptyMetricQuery,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any);
            deps.projectService.getExplore.mockResolvedValue(
                makeExplore(false),
            );
            const strategy = makeStrategy(deps);

            await strategy.auditDashboard({
                account,
                projectUuid,
                dashboard,
            });

            expect(findMatchSpy).toHaveBeenCalledTimes(1);
            const [mqArg] = findMatchSpy.mock.calls[0] as [
                MetricQuery,
                Explore,
            ];
            const dimGroup = mqArg.filters?.dimensions as
                | { and?: unknown[]; or?: unknown[] }
                | undefined;
            const dimensionFilterCount =
                dimGroup?.and?.length ?? dimGroup?.or?.length ?? 0;
            expect(dimensionFilterCount).toBe(0);
        } finally {
            findMatchSpy.mockRestore();
        }
    });

    it('prefers runtimeFilters over dashboard.filters when provided', async () => {
        const deps = makeDeps();
        const savedFilter: DashboardFilterRule = {
            id: 'f-saved',
            target: { fieldId: 'orders_saved_only', tableName: 'orders' },
            operator: FilterOperator.EQUALS,
            values: ['saved'],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;
        const runtimeFilter: DashboardFilterRule = {
            id: 'f-runtime',
            target: { fieldId: 'orders_runtime_only', tableName: 'orders' },
            operator: FilterOperator.EQUALS,
            values: ['runtime'],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;
        const dashboard = makeDashboard({
            tiles: [makeTile({ uuid: 't-1' })],
            filters: {
                dimensions: [savedFilter],
                metrics: [],
                tableCalculations: [],
            },
        });
        deps.savedChartModel.get.mockResolvedValue({
            uuid: 'c-1',
            tableName: 'orders',
            metricQuery: emptyMetricQuery,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        deps.projectService.getExplore.mockResolvedValue(makeExplore(false));
        const strategy = makeStrategy(deps);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const auditTileSpy = jest.spyOn(strategy as any, 'auditTile');
        await strategy.auditDashboard({
            account,
            projectUuid,
            dashboard,
            runtimeFilters: {
                dimensions: [runtimeFilter],
                metrics: [],
                tableCalculations: [],
            },
        });

        const calledWith = auditTileSpy.mock.calls[0][0] as {
            savedDashboardFilters: { dimensions: DashboardFilterRule[] };
        };
        expect(calledWith.savedDashboardFilters.dimensions).toHaveLength(1);
        expect(calledWith.savedDashboardFilters.dimensions[0].id).toBe(
            'f-runtime',
        );
        auditTileSpy.mockRestore();
    });
});
