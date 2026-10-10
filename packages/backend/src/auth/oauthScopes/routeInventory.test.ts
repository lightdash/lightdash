import path from 'node:path';
import { OAUTH_CASL_CHECKED_ROUTES } from './caslCheckedRoutes';
import { classifyOAuthOperation } from './scopeMap';
import {
    collectOAuthRoutes,
    collectOAuthRoutesFromSources,
    parseSource,
    sourceFiles,
} from './testing/routeInventory';
import { OAUTH_UNCHECKED_OPERATIONS } from './unchecked';

const root = path.resolve(__dirname, '../..');
const routes = collectOAuthRoutesFromSources([
    ...['controllers', 'ee/controllers', 'routers', 'ee/routers'].flatMap(
        (directory) =>
            sourceFiles(path.join(root, directory)).map((file) =>
                parseSource(file),
            ),
    ),
    parseSource(path.join(root, 'App.ts')),
    parseSource(path.join(root, 'index.ts')),
    parseSource(path.join(root, 'ee/index.ts')),
]);

it('requires a reviewed authorization boundary for every OAuth route', () => {
    expect(routes.length).toBeGreaterThan(100);
    expect(
        routes
            .filter(
                (route) =>
                    !OAUTH_CASL_CHECKED_ROUTES.includes(route.id) &&
                    route.guards.length === 0,
            )
            .map((route) => route.id),
    ).toEqual([]);
});
it('rejects unknown or stale unchecked operations', () => {
    const used = new Set(routes.flatMap((route) => route.guards));
    expect([...used].sort()).toEqual(
        Object.keys(OAUTH_UNCHECKED_OPERATIONS).sort(),
    );
});
it('rejects stale or duplicate CASL route entries', () => {
    const ids = new Set(routes.map((route) => route.id));
    expect(OAUTH_CASL_CHECKED_ROUTES.filter((id) => !ids.has(id))).toEqual([]);
    expect(new Set(OAUTH_CASL_CHECKED_ROUTES).size).toBe(
        OAUTH_CASL_CHECKED_ROUTES.length,
    );
});
it('runs scope middleware after authentication', () => {
    expect(
        routes.filter((route) => route.invalidOrder).map((route) => route.id),
    ).toEqual([]);
});
it('discovers multiline decorators, class middleware, aliases and Express arrays', () => {
    const source = parseSource(
        'fixture.ts',
        `
        import { allowOauthAuthentication as authenticate } from './authentication';
        @Middlewares([authenticate])
        class Controller {
            @Get('/read')
            read() {}
            @Post('/write')
            @Middlewares([
                requireOAuthScopeOperation('Controller.write'),
            ])
            write() {}
        }
        router.get(['/one', '/two'], authenticate, handler);
    `,
    );
    expect(
        collectOAuthRoutes(source).map(({ id, guards, invalidOrder }) => ({
            id,
            guards,
            invalidOrder,
        })),
    ).toEqual([
        { id: 'Controller.read', guards: [], invalidOrder: false },
        {
            id: 'Controller.write',
            guards: ['Controller.write'],
            invalidOrder: false,
        },
        { id: 'router GET /one', guards: [], invalidOrder: false },
        { id: 'router GET /two', guards: [], invalidOrder: false },
    ]);
});
it('detects scope middleware placed before authentication', () => {
    const source = parseSource(
        'fixture.ts',
        `router.get('/read', requireOAuthScopeOperation('read'), allowApiKeyAuthentication, handler);`,
    );
    expect(collectOAuthRoutes(source)[0].invalidOrder).toBe(true);
});

it('discovers router middleware, local wrappers, and chained route registrations', () => {
    const source = parseSource(
        'fixture.ts',
        `
        const authenticate = (req, res, next) => allowApiKeyAuthentication(req, res, next);
        const middleware = [authenticate];
        router.use('/private', ...middleware);
        router.get('/private/read', handler);
        router.route('/private/write').post(handler).delete(handler);
        router.get('/public', handler);
    `,
    );
    expect(collectOAuthRoutes(source).map(({ id }) => id)).toEqual([
        'router GET /private/read',
        'router DELETE /private/write',
        'router POST /private/write',
    ]);
});
it('finds inline assertions and expands middleware arrays in execution order', () => {
    const source = parseSource(
        'fixture.ts',
        `
        const middleware = [allowApiKeyAuthentication, requireOAuthScopeOperation('read')];
        router.get('/read', middleware, handler);
        router.post('/write', allowOauthAuthentication, (req) => {
            assertOAuthScopeOperation(req.account, 'write');
        });
    `,
    );
    expect(
        collectOAuthRoutes(source).map(({ guards, invalidOrder }) => ({
            guards,
            invalidOrder,
        })),
    ).toEqual([
        { guards: ['read'], invalidOrder: false },
        { guards: ['write'], invalidOrder: false },
    ]);
});

it.each([
    ['SupportController.shareSupport', 'write'],
    ['UserController.getUserOnboarding', 'read'],
    ['UserController.getUserLearnProgress', 'read'],
    ['oauthRouter GET /userinfo', 'read'],
] as const)('guards %s with its reviewed operation', (id, classification) => {
    expect(routes.find((route) => route.id === id)?.guards).toContain(id);
    expect(OAUTH_UNCHECKED_OPERATIONS[id]).toBe(classification);
});

it('keeps route identities and authorization inventories unambiguous', () => {
    expect(new Set(routes.map((route) => route.id)).size).toBe(routes.length);
    expect(
        routes
            .filter(
                (route) =>
                    route.guards.length > 0 &&
                    OAUTH_CASL_CHECKED_ROUTES.includes(route.id),
            )
            .map((route) => route.id),
    ).toEqual([]);
});

it.each([
    ['QueryController.downloadResults', 'view', 'Project'],
    ['QueryController.scheduleDownloadResults', 'view', 'Project'],
    ['QueryController.cancelAsyncQuery', 'view', 'Project'],
    ['QueryController.getAsyncQueryResults', 'view', 'Project'],
    ['QueryController.getResultsStream', 'view', 'Project'],
    ['QueryController.executeAsyncMetricQuery', 'view', 'Explore'],
    ['QueryController.executeAsyncFieldValueSearch', 'view', 'Explore'],
    ['QueryController.executeAsyncSavedChartQuery', 'view', 'SavedChart'],
    ['QueryController.executeAsyncUnderlyingDataQuery', 'view', 'Explore'],
    ['QueryController.executeAsyncDashboardChartQuery', 'view', 'Dashboard'],
    ['QueryController.executeAsyncDashboardSqlChartQuery', 'view', 'Dashboard'],
    ['QueryController.executeAsyncMergeQuery', 'view', 'Explore'],
    ['QueryController.executeAsyncComposeMergeQuery', 'view', 'Explore'],
    ['ProjectController.CompileMergeQuery', 'view', 'Explore'],
    ['ProjectController.RunMergeQuery', 'view', 'Explore'],
    ['ExploreController.CompileQuery', 'view', 'Explore'],
    ['SavedChartController.postChartResults', 'view', 'SavedChart'],
    ['SavedChartController.postDashboardTile', 'view', 'Dashboard'],
    ['SavedChartController.getChartVersionResults', 'view', 'SavedChart'],
    ['SavedChartController.calculateTotalFromSavedChart', 'view', 'SavedChart'],
    ['SavedChartController.exportSavedChartImage', 'view', 'SavedChart'],
    ['DocumentController.executeChartQuery', 'view', 'Document'],
    ['DocumentController.exportPdf', 'view', 'Document'],
    ['DashboardControllerV2.exportDashboardContent', 'view', 'Dashboard'],
    ['dashboardRouter POST /:dashboardUuid/export', 'view', 'Dashboard'],
    ['SqlRunnerController.getSavedSqlResultsJob', 'view', 'Space'],
    ['SqlRunnerController.getSavedSqlResultsJobByUuid', 'view', 'Space'],
    ['RunViewChartQueryController.postUnderlyingData', 'view', 'Explore'],
    ['MetricsExplorerController.runMetricTotal', 'view', 'Explore'],
    ['MetricsExplorerController.runMetricSeries', 'view', 'Explore'],
    ['MetricsExplorerController.compileMetricTotalQuery', 'view', 'Explore'],
    ['UserActivityController.exportUserActivityCsv', 'view', 'Analytics'],
] as const)(
    'keeps the %s guard no stricter than its CASL boundary',
    (id, action, subject) => {
        expect(routes.find((route) => route.id === id)?.guards).toContain(id);
        const classification = classifyOAuthOperation(action, subject);
        expect(classification).not.toBeNull();
        expect(
            OAUTH_UNCHECKED_OPERATIONS[id] === 'read' ||
                classification === 'write',
        ).toBe(true);
    },
);

it.each(['rebaseContentDraft', 'reopenContentDraft'] as const)(
    'requires write scope for the %s mutation behind a view-only CASL check',
    (method) => {
        const id = `ProjectCoderController.${method}` as const;
        expect(routes.find((route) => route.id === id)?.guards).toContain(id);
        expect(OAUTH_UNCHECKED_OPERATIONS[id]).toBe('write');
    },
);
