import {
    AuthorizationError,
    DashboardTileTypes,
    DimensionType,
    ExploreType,
    FeatureFlags,
    FieldType,
    ForbiddenError,
    MergeJoinType,
    NotFoundError,
    ParameterError,
    type Account,
    type Explore,
    type SavedChartDAO,
    type SavedMergeDefinition,
} from '@lightdash/common';
import { fromSession } from '../../auth/account/account';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import type { AccessTarget } from '../SpaceService/SpacePermissionService';
import { DashboardService } from './DashboardService';
import { chart, user } from './DashboardService.mock';

const { projectUuid } = chart;
const account = fromSession(user);
// Explores as the explore compiler leaves them: references sit on the compiled
// table (sql_where) and fields, so no SQL is compiled here
const exploreWithParameters = (
    name: string,
    parameterReferences: string[],
    fieldParameterReferences: string[] = [],
): Explore =>
    ({
        name,
        baseTable: name,
        joinedTables: [],
        tables: {
            [name]: {
                name,
                sqlTable: `"schema"."${name}"`,
                parameterReferences,
                dimensions: {
                    amount: {
                        fieldType: FieldType.DIMENSION,
                        type: DimensionType.NUMBER,
                        name: 'amount',
                        table: name,
                        sql: '${TABLE}.amount',
                        compiledSql: `"${name}".amount`,
                        parameterReferences: fieldParameterReferences,
                    },
                },
                metrics: {},
            },
        },
    }) as unknown as Explore;
const explore = exploreWithParameters(
    chart.tableName,
    ['orders.region'],
    ['orders.min_amount'],
);
const paymentsExplore = exploreWithParameters('payments', ['payments.region']);
const explores: Record<string, Explore> = {
    [chart.tableName]: explore,
    payments: paymentsExplore,
};
// Sources on a parameter with no default used to fail the compile, not the listing
const requiredParameterExplore: Explore = {
    ...exploreWithParameters('required', ['required.region']),
    parameters: { region: { label: 'Region' } },
};
const merge: SavedMergeDefinition = {
    queries: {
        payments: {
            explore: 'payments',
            dimensions: ['payments_amount'],
            metrics: [],
        },
    },
    join: MergeJoinType.LEFT,
    keys: { table_name_amount: ['payments.payments_amount'] },
    limit: 500,
};
const spaceContext = {
    organizationUuid: user.organizationUuid!,
    projectUuid,
    inheritsFromOrgOrProject: true,
    access: [],
    admins: [],
};
const privateSpaceUuid = 'private-space';

const savedChart = (overrides: Partial<SavedChartDAO>): SavedChartDAO => ({
    ...chart,
    ...overrides,
});
const charts: Record<string, SavedChartDAO> = {
    plain: savedChart({ uuid: 'plain' }),
    sameExplore: savedChart({ uuid: 'sameExplore' }),
    merged: savedChart({ uuid: 'merged', merge }),
    selecting: savedChart({
        uuid: 'selecting',
        metricQuery: {
            ...chart.metricQuery,
            dimensions: [`${chart.tableName}_amount`],
        },
    }),
    broken: savedChart({ uuid: 'broken', tableName: 'broken' }),
    hidden: savedChart({ uuid: 'hidden', spaceUuid: privateSpaceUuid }),
};

const embeddedDashboard = {
    uuid: 'embedded-dashboard',
    tiles: [
        {
            uuid: 'embed-chart-tile',
            type: DashboardTileTypes.SAVED_CHART,
            properties: { savedChartUuid: 'plain' },
        },
        {
            uuid: 'embed-hidden-tile',
            type: DashboardTileTypes.SAVED_CHART,
            properties: { savedChartUuid: 'hidden' },
        },
        {
            uuid: 'embed-sql-tile',
            type: DashboardTileTypes.SQL_CHART,
            properties: { savedSqlUuid: 'sql', chartName: 'SQL' },
        },
    ],
};

const setup = ({ dashboardControlsEnabled = true } = {}) => {
    const featureFlagModel = {
        get: vi.fn(async () => ({
            id: FeatureFlags.DashboardControls,
            enabled: dashboardControlsEnabled,
        })),
    };
    const savedChartModel = {
        get: vi.fn(async (uuid: string) => {
            if (!charts[uuid]) throw new NotFoundError('Saved chart not found');
            return charts[uuid];
        }),
    };
    const savedSqlModel = {
        getByUuid: vi.fn(async (savedSqlUuid: string) => ({
            savedSqlUuid,
            sql: 'select * from orders where region = ${lightdash.parameters.region}',
            space: { uuid: 'space', name: 'Space' },
        })),
    };
    const spacePermissionService = {
        resolveAccessBatch: vi.fn(
            async (_userUuid: string, targets: AccessTarget[]) =>
                targets.map((target) => ({
                    target,
                    context:
                        target.spaceUuid === privateSpaceUuid
                            ? undefined
                            : spaceContext,
                })),
        ),
    };
    const projectService = {
        projectParametersModel: { find: vi.fn().mockResolvedValue([]) },
        findExplores: vi.fn(
            async ({
                exploreNames,
            }: {
                exploreNames: string[];
            }): Promise<Record<string, Explore>> =>
                Object.fromEntries(
                    exploreNames.flatMap((name) =>
                        explores[name] ? [[name, explores[name]]] : [],
                    ),
                ),
        ),
    };
    const dashboardModel = {
        getByIdOrSlug: vi.fn(async () => embeddedDashboard),
    };
    const service = new DashboardService({
        lightdashConfig: lightdashConfigMock,
        savedChartModel,
        savedSqlModel,
        spacePermissionService,
        projectService,
        dashboardModel,
        featureFlagModel,
    } as unknown as ConstructorParameters<typeof DashboardService>[0]);
    return {
        service,
        featureFlagModel,
        savedSqlModel,
        savedChartModel,
        projectService,
        dashboardModel,
    };
};

const embedAccount = (
    content: Record<string, unknown>,
    embed: Record<string, unknown> = {},
) =>
    ({
        isJwtUser: () => true,
        isRegisteredUser: () => false,
        user: { id: 'embed-user' },
        organization: { organizationUuid: user.organizationUuid },
        access: { content },
        embed: {
            projectUuid,
            allowAllDashboards: false,
            dashboardUuids: ['embedded-dashboard'],
            ...embed,
        },
    }) as unknown as Account;
const dashboardEmbed = embedAccount({
    type: 'dashboard',
    dashboardUuid: 'embedded-dashboard',
    chartUuids: [],
    explores: [],
});

const chartTile = (tileUuid: string, savedChartUuid: string) => ({
    tileUuid,
    savedChartUuid,
    savedSqlUuid: null,
});

const noSavedValues = { chartSavedValues: {}, virtualViewSavedValues: {} };

describe('DashboardService.getTileParameterReferences', () => {
    it('reads the explore and the chart query, without compiling', async () => {
        const { service, projectService } = setup();

        await expect(
            service.getTileParameterReferences(account, projectUuid, [
                chartTile('tile-1', 'plain'),
                chartTile('tile-2', 'selecting'),
            ]),
        ).resolves.toEqual([
            {
                tileUuid: 'tile-1',
                parameterReferences: ['orders.region'],
                ...noSavedValues,
                error: null,
                parameterDefinitions: {},
            },
            {
                tileUuid: 'tile-2',
                parameterReferences: ['orders.min_amount', 'orders.region'],
                ...noSavedValues,
                error: null,
                parameterDefinitions: {},
            },
        ]);
        expect(projectService.findExplores).toHaveBeenCalledWith(
            expect.objectContaining({ exploreNames: [chart.tableName] }),
        );
    });

    it('returns referenced model and project definitions for unopened tiles without exposing private charts', async () => {
        const { service, projectService } = setup();
        projectService.projectParametersModel.find.mockResolvedValue([
            {
                name: 'region',
                config: { label: 'Region', type: 'string', multiple: true },
            },
            { name: 'secret', config: { label: 'Secret', type: 'string' } },
        ]);
        projectService.findExplores.mockImplementation(
            async ({ exploreNames }) =>
                Object.fromEntries(
                    exploreNames.map((name) => [
                        name,
                        {
                            ...explore,
                            tables: {
                                ...explore.tables,
                                [name]: {
                                    ...explore.tables[name],
                                    originalName: 'orders',
                                    parameters: {
                                        region: {
                                            label: 'Region',
                                            type: 'number',
                                            multiple: true,
                                        },
                                        unused: {
                                            label: 'Unused',
                                            type: 'string',
                                        },
                                    },
                                },
                            },
                        },
                    ]),
                ),
        );
        const result = await service.getTileParameterReferences(
            account,
            projectUuid,
            [
                chartTile('unopened', 'plain'),
                chartTile('private', 'hidden'),
                { tileUuid: 'sql', savedChartUuid: null, savedSqlUuid: 'sql' },
            ],
        );
        expect(result[0]).toEqual({
            tileUuid: 'unopened',
            parameterReferences: ['orders.region'],
            parameterDefinitions: {
                'orders.region': {
                    label: 'Region',
                    type: 'number',
                    multiple: true,
                },
            },
            ...noSavedValues,
            error: null,
        });
        expect(result[1]).toEqual({
            tileUuid: 'private',
            parameterReferences: null,
            error: expect.any(String),
        });
        expect(result[2]).toEqual({
            tileUuid: 'sql',
            parameterReferences: ['region'],
            parameterDefinitions: {
                region: { label: 'Region', type: 'string', multiple: true },
            },
            ...noSavedValues,
            error: null,
        });
    });

    it('returns chart and virtual view saved values, empty for SQL charts', async () => {
        const { service, projectService } = setup();
        charts.withValues = savedChart({
            uuid: 'withValues',
            merge,
            parameters: { 'orders.region': 'EU' },
        });
        projectService.findExplores.mockImplementation(
            async ({ exploreNames }) =>
                Object.fromEntries(
                    exploreNames.map((name) => [
                        name,
                        {
                            ...explores[name],
                            savedParameterValues: { [`${name}.region`]: name },
                        },
                    ]),
                ),
        );

        await expect(
            service.getTileParameterReferences(account, projectUuid, [
                chartTile('tile-1', 'withValues'),
                { tileUuid: 'sql', savedChartUuid: null, savedSqlUuid: 'sql' },
            ]),
        ).resolves.toEqual([
            {
                tileUuid: 'tile-1',
                parameterReferences: ['orders.region', 'payments.region'],
                chartSavedValues: { 'orders.region': 'EU' },
                virtualViewSavedValues: {
                    [`${chart.tableName}.region`]: chart.tableName,
                    'payments.region': 'payments',
                },
                error: null,
                parameterDefinitions: {},
            },
            {
                tileUuid: 'sql',
                parameterReferences: ['region'],
                ...noSavedValues,
                error: null,
                parameterDefinitions: {},
            },
        ]);
    });

    it('loads each explore and chart once across tiles', async () => {
        const { service, savedChartModel, projectService } = setup();

        const results = await service.getTileParameterReferences(
            account,
            projectUuid,
            [
                chartTile('tile-1', 'plain'),
                chartTile('tile-2', 'plain'),
                chartTile('tile-3', 'sameExplore'),
            ],
        );

        expect(results.map((result) => result.tileUuid)).toEqual([
            'tile-1',
            'tile-2',
            'tile-3',
        ]);
        expect(savedChartModel.get).toHaveBeenCalledTimes(2);
        expect(projectService.findExplores).toHaveBeenCalledTimes(1);
        expect(projectService.findExplores).toHaveBeenCalledWith(
            expect.objectContaining({ exploreNames: [chart.tableName] }),
        );
    });

    it('loads at most five charts at a time', async () => {
        const { service, savedChartModel } = setup();
        const manyCharts = Array.from({ length: 12 }, (_, index) =>
            savedChart({ uuid: `load-${index}` }),
        );
        manyCharts.forEach((manyChart) => {
            charts[manyChart.uuid] = manyChart;
        });
        let running = 0;
        let maxRunning = 0;
        savedChartModel.get.mockImplementation(async (uuid: string) => {
            running += 1;
            maxRunning = Math.max(maxRunning, running);
            await new Promise((resolve) => {
                setTimeout(resolve, 5);
            });
            running -= 1;
            return charts[uuid];
        });

        await service.getTileParameterReferences(
            account,
            projectUuid,
            manyCharts.map((manyChart) =>
                chartTile(`tile-${manyChart.uuid}`, manyChart.uuid),
            ),
        );

        expect(savedChartModel.get).toHaveBeenCalledTimes(12);
        expect(maxRunning).toBe(5);
    });

    it('refuses a request with too many tiles before loading any', async () => {
        const { service, savedChartModel } = setup();

        await expect(
            service.getTileParameterReferences(
                account,
                projectUuid,
                Array.from({ length: 201 }, (_, index) =>
                    chartTile(`tile-${index}`, 'plain'),
                ),
            ),
        ).rejects.toThrow(
            new ParameterError(
                'A request can list the parameters of at most 200 tiles',
            ),
        );
        expect(savedChartModel.get).not.toHaveBeenCalled();
    });

    it('refuses the request with the dashboard-controls flag off', async () => {
        const { service, savedChartModel, featureFlagModel } = setup({
            dashboardControlsEnabled: false,
        });

        await expect(
            service.getTileParameterReferences(account, projectUuid, [
                chartTile('tile-1', 'plain'),
            ]),
        ).rejects.toThrow(ForbiddenError);
        expect(featureFlagModel.get).toHaveBeenCalledWith({
            user: {
                organizationUuid: user.organizationUuid,
                userUuid: user.userUuid,
            },
            featureFlagId: FeatureFlags.DashboardControls,
        });
        expect(savedChartModel.get).not.toHaveBeenCalled();
    });

    it('reports a restricted explore on its own tiles only', async () => {
        const { service, projectService } = setup();
        charts.restricted = savedChart({
            uuid: 'restricted',
            tableName: 'restricted',
            metricQuery: { ...chart.metricQuery, exploreName: 'restricted' },
        });
        projectService.findExplores.mockImplementation(
            async ({ exploreNames }: { exploreNames: string[] }) => {
                if (exploreNames.includes('restricted')) {
                    throw new AuthorizationError(
                        "You don't have authorization to access this explore",
                    );
                }
                return explores;
            },
        );

        await expect(
            service.getTileParameterReferences(account, projectUuid, [
                chartTile('tile-1', 'plain'),
                chartTile('tile-2', 'restricted'),
                {
                    tileUuid: 'tile-3',
                    savedChartUuid: null,
                    savedSqlUuid: 'sql',
                },
            ]),
        ).resolves.toEqual([
            {
                tileUuid: 'tile-1',
                parameterReferences: ['orders.region'],
                ...noSavedValues,
                error: null,
                parameterDefinitions: {},
            },
            {
                tileUuid: 'tile-2',
                parameterReferences: null,
                error: "You don't have authorization to access this explore",
            },
            {
                tileUuid: 'tile-3',
                parameterReferences: ['region'],
                ...noSavedValues,
                error: null,
                parameterDefinitions: {},
            },
        ]);
    });

    it('unions the references of every query a merged chart runs', async () => {
        const { service, projectService } = setup();

        await expect(
            service.getTileParameterReferences(account, projectUuid, [
                chartTile('tile-1', 'merged'),
            ]),
        ).resolves.toEqual([
            {
                tileUuid: 'tile-1',
                parameterReferences: ['orders.region', 'payments.region'],
                ...noSavedValues,
                error: null,
                parameterDefinitions: {},
            },
        ]);
        expect(projectService.findExplores).toHaveBeenCalledTimes(1);
        expect(projectService.findExplores).toHaveBeenCalledWith(
            expect.objectContaining({
                exploreNames: [chart.tableName, 'payments'],
            }),
        );
    });

    it('lists a merged chart whose source needs a parameter with no default', async () => {
        const { service } = setup();
        explores.required = requiredParameterExplore;
        charts.requiring = savedChart({
            uuid: 'requiring',
            parameters: undefined,
            merge: {
                ...merge,
                queries: {
                    required: {
                        explore: 'required',
                        dimensions: ['required_amount'],
                        metrics: [],
                    },
                },
                keys: { table_name_amount: ['required.required_amount'] },
            },
        });

        await expect(
            service.getTileParameterReferences(account, projectUuid, [
                chartTile('tile-1', 'requiring'),
            ]),
        ).resolves.toEqual([
            {
                tileUuid: 'tile-1',
                parameterReferences: ['orders.region', 'required.region'],
                ...noSavedValues,
                error: null,
                parameterDefinitions: {},
            },
        ]);
    });

    it('fails only the chart whose stored merge cannot be rebuilt', async () => {
        const { service } = setup();
        charts.corrupt = savedChart({
            uuid: 'corrupt',
            merge: { ...merge, keys: null as never },
        });

        const results = await service.getTileParameterReferences(
            account,
            projectUuid,
            [chartTile('tile-1', 'corrupt'), chartTile('tile-2', 'plain')],
        );

        expect(results[0]).toEqual({
            tileUuid: 'tile-1',
            parameterReferences: null,
            error: expect.stringContaining('null'),
        });
        expect(results[1]).toEqual({
            tileUuid: 'tile-2',
            parameterReferences: ['orders.region'],
            ...noSavedValues,
            error: null,
            parameterDefinitions: {},
        });
    });

    it('skips a selected field the explore no longer has', async () => {
        const { service } = setup();
        charts.stale = savedChart({
            uuid: 'stale',
            metricQuery: {
                ...chart.metricQuery,
                dimensions: [
                    `${chart.tableName}_amount`,
                    `${chart.tableName}_gone`,
                ],
            },
        });

        await expect(
            service.getTileParameterReferences(account, projectUuid, [
                chartTile('tile-1', 'stale'),
            ]),
        ).resolves.toEqual([
            {
                tileUuid: 'tile-1',
                parameterReferences: ['orders.min_amount', 'orders.region'],
                ...noSavedValues,
                error: null,
                parameterDefinitions: {},
            },
        ]);
    });

    it('lists no parameters for a chart on an API source explore', async () => {
        const { service } = setup();
        explores.api = {
            ...exploreWithParameters('api', []),
            type: ExploreType.API_SOURCE,
        };
        charts.api = savedChart({ uuid: 'api', tableName: 'api' });

        await expect(
            service.getTileParameterReferences(account, projectUuid, [
                chartTile('tile-1', 'api'),
            ]),
        ).resolves.toEqual([
            {
                tileUuid: 'tile-1',
                parameterReferences: [],
                parameterDefinitions: {},
                ...noSavedValues,
                error: null,
            },
        ]);
    });

    it('reports a merged chart whose source explore is missing as a failed tile', async () => {
        const { service } = setup();
        charts.mergedBroken = savedChart({
            uuid: 'mergedBroken',
            merge: {
                ...merge,
                queries: {
                    gone: { explore: 'gone', dimensions: [], metrics: [] },
                },
            },
        });

        await expect(
            service.getTileParameterReferences(account, projectUuid, [
                chartTile('tile-1', 'mergedBroken'),
            ]),
        ).resolves.toEqual([
            {
                tileUuid: 'tile-1',
                parameterReferences: null,
                error: 'Explore "gone" is not available',
            },
        ]);
    });

    it('reads a SQL chart from its SQL', async () => {
        const { service } = setup();

        await expect(
            service.getTileParameterReferences(account, projectUuid, [
                {
                    tileUuid: 'tile-1',
                    savedChartUuid: null,
                    savedSqlUuid: 'sql',
                },
            ]),
        ).resolves.toEqual([
            {
                tileUuid: 'tile-1',
                parameterReferences: ['region'],
                ...noSavedValues,
                error: null,
                parameterDefinitions: {},
            },
        ]);
    });

    it('reports failing, missing and hidden tiles without failing the rest', async () => {
        const { service } = setup();

        const results = await service.getTileParameterReferences(
            account,
            projectUuid,
            [
                chartTile('good', 'plain'),
                chartTile('failing', 'broken'),
                chartTile('missing', 'deleted'),
                chartTile('denied', 'hidden'),
            ],
        );

        expect(results).toEqual([
            {
                tileUuid: 'good',
                parameterReferences: ['orders.region'],
                ...noSavedValues,
                error: null,
                parameterDefinitions: {},
            },
            {
                tileUuid: 'failing',
                parameterReferences: null,
                error: 'Explore "broken" is not available',
            },
            {
                tileUuid: 'missing',
                parameterReferences: null,
                error: 'Saved chart not found',
            },
            {
                tileUuid: 'denied',
                parameterReferences: null,
                error: "You don't have access to view this chart",
            },
        ]);
    });

    it('reports a SQL chart that fails to load without failing the rest', async () => {
        const { service, savedSqlModel } = setup();
        savedSqlModel.getByUuid.mockImplementation(async (savedSqlUuid) => {
            if (savedSqlUuid === 'deleted-sql') {
                throw new NotFoundError('SQL chart not found');
            }
            return {
                savedSqlUuid,
                sql: 'select * from orders where region = ${lightdash.parameters.region}',
                space: { uuid: 'space', name: 'Space' },
            };
        });
        const sqlTile = (tileUuid: string, savedSqlUuid: string) => ({
            tileUuid,
            savedChartUuid: null,
            savedSqlUuid,
        });

        await expect(
            service.getTileParameterReferences(account, projectUuid, [
                sqlTile('missing', 'deleted-sql'),
                sqlTile('good', 'sql'),
            ]),
        ).resolves.toEqual([
            {
                tileUuid: 'missing',
                parameterReferences: null,
                error: 'SQL chart not found',
            },
            {
                tileUuid: 'good',
                parameterReferences: ['region'],
                ...noSavedValues,
                error: null,
                parameterDefinitions: {},
            },
        ]);
    });

    it('refuses a chart addressed by slug instead of uuid', async () => {
        const { service } = setup();
        charts['plain-slug'] = charts.plain;

        await expect(
            service.getTileParameterReferences(account, projectUuid, [
                chartTile('tile-1', 'plain-slug'),
                chartTile('tile-2', 'plain'),
            ]),
        ).resolves.toEqual([
            {
                tileUuid: 'tile-1',
                parameterReferences: null,
                error: 'Saved chart plain-slug must be addressed by its uuid',
            },
            {
                tileUuid: 'tile-2',
                parameterReferences: ['orders.region'],
                ...noSavedValues,
                error: null,
                parameterDefinitions: {},
            },
        ]);
    });

    describe('embed accounts', () => {
        it("lists the token dashboard's tiles with the charts saved on it", async () => {
            const { service, savedChartModel } = setup();

            const results = await service.getTileParameterReferences(
                dashboardEmbed,
                projectUuid,
                [
                    // the body names another chart; the dashboard's chart wins
                    chartTile('embed-chart-tile', 'merged'),
                    {
                        tileUuid: 'embed-sql-tile',
                        savedChartUuid: null,
                        savedSqlUuid: 'other-sql',
                    },
                    chartTile('embed-hidden-tile', 'hidden'),
                ],
            );

            expect(results).toEqual([
                {
                    tileUuid: 'embed-chart-tile',
                    parameterReferences: ['orders.region'],
                    ...noSavedValues,
                    error: null,
                    parameterDefinitions: {},
                },
                {
                    tileUuid: 'embed-sql-tile',
                    parameterReferences: ['region'],
                    ...noSavedValues,
                    error: null,
                    parameterDefinitions: {},
                },
                {
                    tileUuid: 'embed-hidden-tile',
                    parameterReferences: ['orders.region'],
                    ...noSavedValues,
                    error: null,
                    parameterDefinitions: {},
                },
            ]);
            expect(savedChartModel.get).not.toHaveBeenCalledWith(
                'merged',
                undefined,
                expect.anything(),
            );
        });

        it.each([
            [
                'a dashboard the embed does not allow',
                { dashboardUuids: ['other-dashboard'] },
            ],
            ['a token for another project', { projectUuid: 'other-project' }],
        ])('refuses %s before loading anything', async (_name, embed) => {
            const { service, savedChartModel, dashboardModel } = setup();

            await expect(
                service.getTileParameterReferences(
                    embedAccount(
                        {
                            type: 'dashboard',
                            dashboardUuid: 'embedded-dashboard',
                            chartUuids: [],
                            explores: [],
                        },
                        embed,
                    ),
                    projectUuid,
                    [chartTile('embed-chart-tile', 'plain')],
                ),
            ).rejects.toThrow(ForbiddenError);
            expect(dashboardModel.getByIdOrSlug).not.toHaveBeenCalled();
            expect(savedChartModel.get).not.toHaveBeenCalled();
        });

        it('allows any dashboard when the embed allows all', async () => {
            const { service } = setup();

            await expect(
                service.getTileParameterReferences(
                    embedAccount(
                        {
                            type: 'dashboard',
                            dashboardUuid: 'embedded-dashboard',
                            chartUuids: [],
                            explores: [],
                        },
                        { allowAllDashboards: true, dashboardUuids: [] },
                    ),
                    projectUuid,
                    [chartTile('embed-chart-tile', 'plain')],
                ),
            ).resolves.toEqual([
                {
                    tileUuid: 'embed-chart-tile',
                    parameterReferences: ['orders.region'],
                    ...noSavedValues,
                    error: null,
                    parameterDefinitions: {},
                },
            ]);
        });

        it('refuses a tile that is not on the token dashboard', async () => {
            const { service, savedChartModel } = setup();

            await expect(
                service.getTileParameterReferences(
                    dashboardEmbed,
                    projectUuid,
                    [chartTile('not-on-dashboard', 'plain')],
                ),
            ).resolves.toEqual([
                {
                    tileUuid: 'not-on-dashboard',
                    parameterReferences: null,
                    error: 'Tile is not on the embedded dashboard',
                },
            ]);
            expect(savedChartModel.get).not.toHaveBeenCalled();
        });

        it('refuses a token that does not embed a dashboard', async () => {
            const { service } = setup();

            await expect(
                service.getTileParameterReferences(
                    embedAccount({
                        type: 'chart',
                        chartUuids: ['plain'],
                        explores: [],
                    }),
                    projectUuid,
                    [chartTile('tile-1', 'plain')],
                ),
            ).rejects.toThrow(ForbiddenError);
        });
    });
});
