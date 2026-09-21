import { Explore, SearchResults, TableSelectionType } from '@lightdash/common';
import { describe, expect, it, vi } from 'vitest';
import {
    CachedExploreTableName,
    ProjectTableName,
} from '../../database/entities/projects';
import { OmnibarSearchTiming } from '../../logging/omnibarSearchTiming';
import { SearchModel } from './index';

const deferred = <T>() => {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((promiseResolve, promiseReject) => {
        resolve = promiseResolve;
        reject = promiseReject;
    });
    return { promise, reject, resolve };
};

const flushPromises = async () => {
    await Promise.resolve();
    await Promise.resolve();
};

const emptyResults: SearchResults = {
    spaces: [],
    dashboards: [],
    savedCharts: [],
    sqlCharts: [],
    tables: [],
    fields: [],
    pages: [],
    dashboardTabs: [],
    dataApps: [],
    documents: [],
};

type SearchModelInternals = {
    getProjectExplores: (
        projectUuid: string,
        timing?: OmnibarSearchTiming,
    ) => Promise<Explore[]>;
    searchDashboardTabs: () => Promise<SearchResults['dashboardTabs']>;
    searchSavedCharts: () => Promise<SearchResults['savedCharts']>;
    searchSpaces: () => Promise<SearchResults['spaces']>;
    searchSqlCharts: () => Promise<SearchResults['sqlCharts']>;
    searchTableErrors: () => Promise<[]>;
};

const makeModel = () =>
    new SearchModel({
        database: vi.fn() as never,
        contentVerificationModel: {} as never,
    });

const installOrchestrationMocks = (
    model: SearchModel,
    calls: string[],
    contentPromises: {
        dashboards: Promise<SearchResults['dashboards']>;
        savedCharts: Promise<SearchResults['savedCharts']>;
        sqlCharts: Promise<SearchResults['sqlCharts']>;
    },
) => {
    const searchSpaces = vi.fn(async () => {
        calls.push('spaces');
        return emptyResults.spaces;
    });
    const searchDashboards = vi.fn(() => {
        calls.push('dashboards');
        return contentPromises.dashboards;
    });
    const searchSavedCharts = vi.fn(() => {
        calls.push('savedCharts');
        return contentPromises.savedCharts;
    });
    const searchSqlCharts = vi.fn(() => {
        calls.push('sqlCharts');
        return contentPromises.sqlCharts;
    });
    const searchDashboardTabs = vi.fn(async () => {
        calls.push('dashboardTabs');
        return emptyResults.dashboardTabs;
    });
    const searchDataApps = vi.fn(async () => {
        calls.push('dataAppsSearch');
        return emptyResults.dataApps;
    });
    const getProjectExplores = vi.fn(async () => {
        calls.push('projectExplores');
        return [];
    });
    const searchTableErrors = vi.fn(async () => {
        calls.push('tableErrors');
        return [];
    });

    Object.assign(model, {
        searchDocuments: vi.fn().mockResolvedValue([]),
        searchSpaces,
        searchDashboards,
        searchSavedCharts,
        searchSqlCharts,
        searchDashboardTabs,
        searchDataApps,
        getProjectExplores,
        searchTableErrors,
    });

    return {
        getProjectExplores,
        searchDashboardTabs,
        searchDashboards,
        searchDataApps,
        searchSavedCharts,
        searchSpaces,
        searchSqlCharts,
        searchTableErrors,
    };
};

describe('SearchModel omnibar timing', () => {
    it('identifies a delayed parallel branch without changing output, call order, or concurrency', async () => {
        const baselineCalls: string[] = [];
        const baselineModel = makeModel();
        installOrchestrationMocks(baselineModel, baselineCalls, {
            dashboards: Promise.resolve([]),
            savedCharts: Promise.resolve([]),
            sqlCharts: Promise.resolve([]),
        });
        const baseline = await baselineModel.search('project', 'query');

        let now = 0;
        const dashboards = deferred<SearchResults['dashboards']>();
        const savedCharts = deferred<SearchResults['savedCharts']>();
        const sqlCharts = deferred<SearchResults['sqlCharts']>();
        const timedCalls: string[] = [];
        const timedModel = makeModel();
        const mocks = installOrchestrationMocks(timedModel, timedCalls, {
            dashboards: dashboards.promise,
            savedCharts: savedCharts.promise,
            sqlCharts: sqlCharts.promise,
        });
        const timing = new OmnibarSearchTiming({
            now: () => now,
            spanId: null,
        });

        const timedPromise = timedModel.search(
            'project',
            'query',
            undefined,
            timing,
        );
        await flushPromises();

        expect(vi.mocked(mocks.searchDashboards)).toHaveBeenCalledTimes(2);
        expect(vi.mocked(mocks.searchSavedCharts)).toHaveBeenCalledTimes(2);
        expect(vi.mocked(mocks.searchSqlCharts)).toHaveBeenCalledTimes(2);
        expect(mocks.searchDashboardTabs).not.toHaveBeenCalled();

        now = 5;
        dashboards.resolve([]);
        await flushPromises();
        now = 8;
        sqlCharts.resolve([]);
        await flushPromises();
        now = 35;
        savedCharts.resolve([]);

        const timed = await timedPromise;
        const snapshot = timing.snapshot('success');

        expect(timed).toEqual(baseline);
        expect(timedCalls).toEqual(baselineCalls);
        expect(snapshot.phaseDurationsMs.dashboards).toBe(5);
        expect(snapshot.phaseDurationsMs.sqlCharts).toBe(8);
        expect(snapshot.phaseDurationsMs.savedCharts).toBe(35);
        expect(snapshot.phaseDurationsMs.contentGroup).toBe(35);
    });

    it('marks non-content phases skipped for verified-only search', async () => {
        const calls: string[] = [];
        const model = makeModel();
        const mocks = installOrchestrationMocks(model, calls, {
            dashboards: Promise.resolve([]),
            savedCharts: Promise.resolve([]),
            sqlCharts: Promise.resolve([]),
        });
        const timing = new OmnibarSearchTiming({ spanId: null });

        await expect(
            model.search('project', 'query', { verifiedOnly: true }, timing),
        ).resolves.toEqual(emptyResults);

        const snapshot = timing.snapshot('success');
        expect(mocks.searchDashboards).toHaveBeenCalledOnce();
        expect(mocks.searchSavedCharts).toHaveBeenCalledOnce();
        expect(mocks.searchSqlCharts).toHaveBeenCalledOnce();
        expect(snapshot.phaseStatuses.contentGroup).toBe('complete');
        expect(snapshot.phaseStatuses.spaces).toBe('skipped');
        expect(snapshot.phaseStatuses.dashboardTabs).toBe('skipped');
        expect(snapshot.phaseStatuses.exploreRows).toBe('skipped');
        expect(snapshot.phaseDurationsMs.exploreRows).toBeNull();
    });

    it('reports unresolved siblings as incomplete after an early parallel rejection', async () => {
        let now = 0;
        const dashboards = deferred<SearchResults['dashboards']>();
        const savedCharts = deferred<SearchResults['savedCharts']>();
        const sqlCharts = deferred<SearchResults['sqlCharts']>();
        const model = makeModel();
        installOrchestrationMocks(model, [], {
            dashboards: dashboards.promise,
            savedCharts: savedCharts.promise,
            sqlCharts: sqlCharts.promise,
        });
        const timing = new OmnibarSearchTiming({
            now: () => now,
            spanId: null,
        });
        const failure = new Error('dashboard search failed');

        const search = model.search('project', 'query', undefined, timing);
        await flushPromises();
        now = 7;
        dashboards.reject(failure);

        await expect(search).rejects.toBe(failure);
        const snapshot = timing.snapshot('error');
        expect(snapshot.phaseStatuses.dashboards).toBe('error');
        expect(snapshot.phaseStatuses.savedCharts).toBe('incomplete');
        expect(snapshot.phaseStatuses.sqlCharts).toBe('incomplete');
        expect(snapshot.phaseStatuses.contentGroup).toBe('error');
        expect(snapshot.phaseDurationsMs.savedCharts).toBeNull();

        savedCharts.resolve([]);
        sqlCharts.resolve([]);
        await flushPromises();
        expect(snapshot.phaseStatuses.savedCharts).toBe('incomplete');
    });

    it('times project selection, explore rows, and in-process filtering through the real method', async () => {
        let now = 0;
        const explore = {
            name: 'orders',
            label: 'Orders',
            tags: [],
            baseTable: 'orders',
            joinedTables: [],
            tables: {},
            targetDatabase: 'postgres',
        } as unknown as Explore;
        const database = vi.fn((tableName: string) => {
            const rows =
                tableName === ProjectTableName
                    ? [
                          {
                              table_selection_type: TableSelectionType.ALL,
                              table_selection_value: null,
                          },
                      ]
                    : [{ explore }];
            const elapsed = tableName === ProjectTableName ? 4 : 11;
            const builder = {
                select: vi.fn(),
                where: vi.fn(),
                limit: vi.fn(),
                whereRaw: vi.fn(),
                orderBy: vi.fn(),
                then: <TResult1 = typeof rows, TResult2 = never>(
                    onFulfilled?:
                        | ((
                              value: typeof rows,
                          ) => TResult1 | PromiseLike<TResult1>)
                        | null,
                    onRejected?:
                        | ((
                              reason: unknown,
                          ) => TResult2 | PromiseLike<TResult2>)
                        | null,
                ) => {
                    now += elapsed;
                    return Promise.resolve(rows).then(onFulfilled, onRejected);
                },
            };
            builder.select.mockReturnValue(builder);
            builder.where.mockReturnValue(builder);
            builder.limit.mockReturnValue(builder);
            builder.whereRaw.mockReturnValue(builder);
            builder.orderBy.mockReturnValue(builder);
            return builder;
        });
        const model = new SearchModel({
            database: database as never,
            contentVerificationModel: {} as never,
        });
        const timing = new OmnibarSearchTiming({
            now: () => now,
            spanId: null,
        });
        const getProjectExplores = (
            model as unknown as SearchModelInternals
        ).getProjectExplores.bind(model);

        await expect(getProjectExplores('project', timing)).resolves.toEqual([
            explore,
        ]);

        const snapshot = timing.snapshot('success');
        expect(database).toHaveBeenNthCalledWith(1, ProjectTableName);
        expect(database).toHaveBeenNthCalledWith(2, CachedExploreTableName);
        expect(snapshot.phaseDurationsMs.exploreSelection).toBe(4);
        expect(snapshot.phaseDurationsMs.exploreRows).toBe(11);
        expect(snapshot.phaseStatuses.exploreFilter).toBe('complete');
    });
});
