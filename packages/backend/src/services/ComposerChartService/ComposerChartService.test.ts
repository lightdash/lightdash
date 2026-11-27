import { Ability } from '@casl/ability';
import {
    AgentCapability,
    ChartType,
    CustomDimensionType,
    DashboardTileTypes,
    DateGranularity,
    DimensionType,
    FeatureNotEnabledError,
    FieldType,
    FilterOperator,
    ForbiddenError,
    MergeJoinType,
    MetricType,
    NotFoundError,
    QueryExecutionContext,
    QuerySourceType,
    TableCalculationType,
    type ComposerChartOwner,
    type ComposerChartPipelineNode,
    type CreateComposerChart,
    type DashboardFilterRule,
    type DashboardFilters,
    type DataAppVizSchema,
    type Explore,
    type ParametersValuesMap,
    type PossibleAbilities,
} from '@lightdash/common';
import { fromOauth, fromSession } from '../../auth/account/account';
import { defaultSessionUser } from '../../auth/account/account.mock';
import { grantFixture } from '../../auth/agentConnectionGrants/grant.mock';
import type { AppModel } from '../../models/AppModel';
import type { ComposerChartModel } from '../../models/ComposerChartModel';
import type { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import type { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import type { QueryHistoryModel } from '../../models/QueryHistoryModel/QueryHistoryModel';
import type { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { ComposerChartService } from './ComposerChartService';
import type { ComposerRunBinding } from './ComposerRunBinding';

const projectUuid = grantFixture().approvedProjectUuids[0];
const organizationUuid = defaultSessionUser.organizationUuid!;
const dashboardUuid = 'dashboard-uuid';

const AUTHOR_SUBJECTS = [
    'ComposerChart',
    'SqlRunner',
    'Explore',
    'MergeQuery',
    'CustomFields',
    'CustomSqlTableCalculations',
] as const;

const abilityWithout = (missing: string | null) =>
    new Ability<PossibleAbilities>([
        { subject: 'SavedChart', action: 'manage' as const },
        ...AUTHOR_SUBJECTS.filter((name) => name !== missing).map((name) => ({
            subject: name,
            action: 'manage' as const,
        })),
    ]);

const sessionAccount = (ability: Ability<PossibleAbilities>) =>
    fromSession({ ...defaultSessionUser, ability }, 'session-cookie');

const semantic = (
    extra: Partial<
        Extract<
            ComposerChartPipelineNode,
            { sourceType: QuerySourceType.SEMANTIC_LAYER }
        >
    > = {},
): ComposerChartPipelineNode => ({
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId: 'orders',
    title: 'Orders',
    exploreName: 'orders',
    dimensions: ['orders_status'],
    metrics: ['orders_count'],
    ...extra,
});

const reading = (
    node: ComposerChartPipelineNode,
): ComposerChartPipelineNode[] => [
    semantic(),
    { ...semantic(), nodeId: 'other', title: 'Other' },
    node,
];

const PIPELINES: Record<string, ComposerChartPipelineNode[]> = {
    sql: [
        {
            sourceType: QuerySourceType.SQL,
            nodeId: 'result',
            title: 'Result',
            sql: 'select 1',
        },
    ],
    duckdb: reading({
        sourceType: QuerySourceType.DUCKDB,
        nodeId: 'result',
        title: 'Result',
        sql: 'select * from orders join other using (orders_status)',
        references: ['orders', 'other'],
    }),
    python: reading({
        sourceType: QuerySourceType.PYTHON,
        nodeId: 'result',
        title: 'Result',
        code: 'def run(inputs, params): return inputs["orders"]',
        references: ['orders', 'other'],
    }),
    merge: reading({
        sourceType: QuerySourceType.MERGE,
        nodeId: 'result',
        title: 'Result',
        sources: [{ nodeId: 'orders' }, { nodeId: 'other' }],
        joinKey: [],
        joinType: MergeJoinType.FULL,
    }),
    customSqlDimension: [
        semantic({
            nodeId: 'result',
            customDimensions: [
                {
                    id: 'status_upper',
                    name: 'status_upper',
                    table: 'orders',
                    type: CustomDimensionType.SQL,
                    sql: 'upper(${orders.status})',
                    dimensionType: 'string' as never,
                },
            ],
        }),
    ],
    handWrittenMetric: [
        semantic({
            nodeId: 'result',
            additionalMetrics: [
                {
                    table: 'orders',
                    name: 'handwritten',
                    type: MetricType.NUMBER,
                    sql: '(SELECT 4242 + 1)',
                },
            ],
        }),
    ],
    mergeSqlTableCalculation: reading({
        sourceType: QuerySourceType.MERGE,
        nodeId: 'result',
        title: 'Result',
        sources: [{ nodeId: 'orders' }, { nodeId: 'other' }],
        joinKey: [],
        joinType: MergeJoinType.FULL,
        tableCalculations: [
            { name: 'doubled', displayName: 'Doubled', sql: '4242 + 1' },
        ],
    }),
    sqlTableCalculation: [
        semantic({
            nodeId: 'result',
            tableCalculations: [
                {
                    name: 'doubled',
                    displayName: 'Doubled',
                    sql: '${orders.count} * 2',
                    type: TableCalculationType.NUMBER,
                },
            ],
        }),
    ],
};

const createBody = (
    nodes: ComposerChartPipelineNode[],
): CreateComposerChart => ({
    dashboardUuid,
    name: 'Orders',
    pipeline: { schemaVersion: 1, terminalNodeId: 'result', nodes },
    chart: {
        schemaVersion: 1,
        columns: [{ reference: 'n', fieldType: FieldType.METRIC }],
        chartConfig: { type: ChartType.TABLE, config: {} },
        pivotConfig: null,
        tableConfig: { columnOrder: ['n'] },
    },
});

const vizSchema: DataAppVizSchema = {
    fields: [
        {
            name: 'category',
            label: 'Category',
            type: 'dimension',
            required: true,
        },
        { name: 'value', label: 'Value', type: 'metric', required: true },
    ],
    configOptions: [],
    colorPalette: null,
};

const customChartBody = (
    config: Record<string, unknown>,
): CreateComposerChart => {
    const body = createBody(PIPELINES.sql);
    return {
        ...body,
        chart: {
            ...body.chart,
            columns: [
                { reference: 'status', fieldType: FieldType.DIMENSION },
                { reference: 'n', fieldType: FieldType.METRIC },
            ],
            chartConfig: {
                type: ChartType.DATA_APP_VIZ,
                config: {
                    dataAppVizUuid: 'viz-uuid',
                    fieldMapping: { category: 'status', value: 'n' },
                    ...config,
                } as never,
            },
        },
    };
};

// The values each node query's history row records; null for the rest
const usedParametersByQuery: Record<string, ParametersValuesMap> = {
    'orders-query': { region: 'EU' },
    'other-query': { region: 'UK' },
};

const runFieldsByQuery: Record<string, object> = {
    'orders-query': {
        orders_created_at: {
            fieldType: FieldType.DIMENSION,
            type: DimensionType.DATE,
            name: 'created_at',
            table: 'orders',
            label: 'Created at month',
        },
    },
};

// The columns a SQL node's query discovered before it was queued
const originalColumnsByQuery: Record<string, object> = {
    'result-query': {
        status: { reference: 'status', type: DimensionType.STRING },
    },
};

const savedDashboardFilters: DashboardFilters = {
    dimensions: [],
    metrics: [],
    tableCalculations: [],
};

const setup = ({ flagEnabled = true } = {}) => {
    const querySourceService = {
        submitComposerRun: vi.fn(
            async ({
                binding,
            }: {
                binding: ComposerRunBinding;
                context: QueryExecutionContext;
            }) => ({
                queries: binding.nodes.map(({ nodeId, sourceType }) => ({
                    nodeId,
                    sourceType,
                    queryUuid: `${nodeId}-query`,
                    cacheHit: false,
                })),
            }),
        ),
    };
    const asyncQueryService = {
        getExplore: vi.fn(
            async (_account: unknown, _project: string, name: string) =>
                ({
                    name,
                    baseTable: name,
                    joinedTables: [],
                    tables: {
                        [name]: {
                            name,
                            dimensions: {
                                amount: {
                                    name: 'amount',
                                    sql: '${TABLE}.amount',
                                },
                                created_at: {
                                    name: 'created_at',
                                    table: name,
                                    type: DimensionType.TIMESTAMP,
                                },
                                shipped_at: {
                                    name: 'shipped_at',
                                    table: name,
                                    type: DimensionType.TIMESTAMP,
                                },
                            },
                            metrics: {},
                        },
                    },
                }) as unknown as Explore,
        ),
        getComposerTileContext: vi.fn(
            async ({
                dashboardFilters,
                parameters,
                excludedParameterKeys,
            }: {
                dashboardFilters: DashboardFilters;
                parameters: ParametersValuesMap | undefined;
                excludedParameterKeys: string[] | undefined;
            }) => ({
                dashboardFilters,
                dashboardValues: parameters ?? {},
                excludedKeys: excludedParameterKeys ?? [],
                projectDefinitions: { region: { label: 'Region' } },
            }),
        ),
    };
    const composerChartModel = {
        create: vi.fn(async () => 'chart-uuid'),
        get: vi.fn(async () => ({ uuid: 'chart-uuid' })),
    };
    const appModel = {
        findAppsBySlugs: vi.fn(async () => []),
        findAppsByUuids: vi.fn(async (_: string, uuids: string[]) =>
            uuids.includes('viz-uuid') ? [{ app_id: 'viz-uuid' }] : [],
        ),
        getVersion: vi.fn(async (_: string, version: number) =>
            version === 2
                ? { version, status: 'ready', viz_schema: vizSchema }
                : null,
        ),
        getLatestRenderableDataAppVizVersion: vi.fn(async () => ({
            version: 2,
            status: 'ready',
            viz_schema: vizSchema,
        })),
    };
    const spacePermissionService = {
        resolveAccess: vi.fn(async () => ({
            organizationUuid,
            projectUuid,
            inheritsFromOrgOrProject: true,
            access: [],
            admins: [],
        })),
    };
    const service = new ComposerChartService({
        composerChartModel: composerChartModel as unknown as ComposerChartModel,
        appModel: appModel as unknown as AppModel,
        dashboardModel: {
            getSummaryByUuid: vi.fn(async () => ({
                projectUuid,
                organizationUuid,
                spaceUuid: 'space-uuid',
            })),
            getByIdOrSlug: vi.fn(async () => ({
                filters: savedDashboardFilters,
                tiles: [
                    {
                        uuid: 'tile-uuid',
                        type: DashboardTileTypes.COMPOSER_CHART,
                        properties: { composerChartUuid: 'chart-uuid' },
                    },
                ],
            })),
        } as unknown as DashboardModel,
        featureFlagModel: {
            get: vi.fn(async () => ({
                id: 'composer-charts',
                enabled: flagEnabled,
            })),
        } as unknown as FeatureFlagModel,
        spacePermissionService:
            spacePermissionService as unknown as SpacePermissionService,
        queryHistoryModel: {
            getByQueryUuid: vi.fn(async (queryUuid: string) => ({
                queryUuid,
                fields: {
                    [`${queryUuid}_field`]: {},
                    ...runFieldsByQuery[queryUuid],
                },
                usedParameters: usedParametersByQuery[queryUuid] ?? null,
                originalColumns: originalColumnsByQuery[queryUuid] ?? null,
            })),
        } as unknown as QueryHistoryModel,
        getQuerySourceService: () => querySourceService,
        getAsyncQueryService: () => asyncQueryService,
    });
    return {
        service,
        composerChartModel,
        querySourceService,
        asyncQueryService,
        spacePermissionService,
    };
};

describe('ComposerChartService.create', () => {
    test('writes a chart when the author holds every permission its nodes need', async () => {
        const { service, composerChartModel } = setup();
        await service.create(
            sessionAccount(abilityWithout(null)),
            projectUuid,
            createBody(PIPELINES.merge),
        );
        expect(composerChartModel.create).toHaveBeenCalledOnce();
    });

    test('is refused with the composer-charts flag off', async () => {
        const { service, composerChartModel } = setup({ flagEnabled: false });
        await expect(
            service.create(
                sessionAccount(abilityWithout(null)),
                projectUuid,
                createBody(PIPELINES.sql),
            ),
        ).rejects.toThrow(FeatureNotEnabledError);
        expect(composerChartModel.create).not.toHaveBeenCalled();
    });

    test.each([
        ['no manage:ComposerChart', 'ComposerChart', PIPELINES.sql],
        ['a sql node without SQL runner', 'SqlRunner', PIPELINES.sql],
        ['a duckdb node without Explore', 'Explore', PIPELINES.duckdb],
        ['a python node without Explore', 'Explore', PIPELINES.python],
        ['a merge node without Explore', 'Explore', PIPELINES.merge],
        [
            'a merge node without manage:MergeQuery',
            'MergeQuery',
            PIPELINES.merge,
        ],
        [
            'a custom SQL dimension without custom fields',
            'CustomFields',
            PIPELINES.customSqlDimension,
        ],
        [
            'a SQL table calculation without SQL table calculations',
            'CustomSqlTableCalculations',
            PIPELINES.sqlTableCalculation,
        ],
        [
            'a custom metric with hand-written SQL without custom fields',
            'CustomFields',
            PIPELINES.handWrittenMetric,
        ],
        [
            'a merge node SQL table calculation without SQL table calculations',
            'CustomSqlTableCalculations',
            PIPELINES.mergeSqlTableCalculation,
        ],
    ])('refuses %s', async (_, missing, nodes) => {
        const { service, composerChartModel } = setup();
        await expect(
            service.create(
                sessionAccount(abilityWithout(missing)),
                projectUuid,
                createBody(nodes),
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(composerChartModel.create).not.toHaveBeenCalled();
    });

    test.each([
        [
            'a custom metric over a modelled field without custom fields',
            'CustomFields',
            [
                semantic({
                    nodeId: 'result',
                    additionalMetrics: [
                        {
                            table: 'orders',
                            name: 'amount_sum',
                            type: MetricType.SUM,
                            sql: '${TABLE}.amount',
                            baseDimensionName: 'amount',
                        },
                    ],
                }),
            ],
        ],
        [
            'a merge node formula calculation without SQL table calculations',
            'CustomSqlTableCalculations',
            reading({
                sourceType: QuerySourceType.MERGE,
                nodeId: 'result',
                title: 'Result',
                sources: [{ nodeId: 'orders' }, { nodeId: 'other' }],
                joinKey: [],
                joinType: MergeJoinType.FULL,
                tableCalculations: [
                    {
                        name: 'doubled',
                        displayName: 'Doubled',
                        sql: '',
                        formula: '=orders_orders_count * 2',
                    },
                ],
            }),
        ],
    ])('allows %s', async (_, missing, nodes) => {
        const { service, composerChartModel } = setup();
        await service.create(
            sessionAccount(abilityWithout(missing)),
            projectUuid,
            createBody(nodes),
        );
        expect(composerChartModel.create).toHaveBeenCalledOnce();
    });

    test('refuses an author who can update the dashboard but not save charts on it', async () => {
        const { service, composerChartModel } = setup();
        const ability = new Ability<PossibleAbilities>([
            { subject: 'Dashboard', action: 'manage' as const },
            { subject: 'SavedChart', action: 'view' as const },
            ...AUTHOR_SUBJECTS.map((name) => ({
                subject: name,
                action: 'manage' as const,
            })),
        ]);
        await expect(
            service.create(
                sessionAccount(ability),
                projectUuid,
                createBody(PIPELINES.sql),
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(composerChartModel.create).not.toHaveBeenCalled();
    });

    test('refuses an agent connection without Raw SQL on a chart with sql nodes', async () => {
        const { service, composerChartModel } = setup();
        const grant = grantFixture();
        const account = fromOauth(
            { ...defaultSessionUser, ability: abilityWithout(null) },
            { accessToken: 'token', client: { id: grant.clientId } },
            null,
            { ...grant, revision: grant.grantRevision },
        );
        await expect(
            service.create(account, projectUuid, createBody(PIPELINES.sql)),
        ).rejects.toThrow('Raw SQL');
        expect(composerChartModel.create).not.toHaveBeenCalled();

        account.authentication.agentConnectionGrant!.approvedCapabilities.push(
            AgentCapability.RawSql,
        );
        await service.create(account, projectUuid, createBody(PIPELINES.sql));
        expect(composerChartModel.create).toHaveBeenCalledOnce();
    });
});

describe('ComposerChartService.preflightPipeline', () => {
    const project = { organizationUuid, projectUuid };

    test('refuses a SQL node from an editor without SQL runner, before any write', async () => {
        const { service, composerChartModel } = setup();
        await expect(
            service.preflightPipeline(
                sessionAccount(abilityWithout('SqlRunner')),
                project,
                createBody(PIPELINES.sql).pipeline,
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(composerChartModel.create).not.toHaveBeenCalled();
    });

    test('passes an editor who holds every permission the nodes need', async () => {
        const { service } = setup();
        await expect(
            service.preflightPipeline(
                sessionAccount(abilityWithout(null)),
                project,
                createBody(PIPELINES.sql).pipeline,
            ),
        ).resolves.toBeUndefined();
    });
});

describe('ComposerChartService.create with a custom chart type', () => {
    test('pins the latest renderable version when the chart names none', async () => {
        const { service, composerChartModel } = setup();
        await service.create(
            sessionAccount(abilityWithout(null)),
            projectUuid,
            customChartBody({}),
        );
        expect(composerChartModel.create).toHaveBeenCalledWith(
            expect.objectContaining({
                chart: expect.objectContaining({
                    chartConfig: {
                        type: ChartType.DATA_APP_VIZ,
                        config: {
                            dataAppVizUuid: 'viz-uuid',
                            dataAppVizVersion: 2,
                            fieldMapping: { category: 'status', value: 'n' },
                        },
                    },
                }),
            }),
        );
    });

    test.each([
        [
            'a version that does not render',
            { dataAppVizVersion: 1 },
            'version 1',
        ],
        ['a type from another project', { dataAppVizUuid: 'other' }, 'other'],
        [
            'a metric slot bound to a dimension',
            { fieldMapping: { category: 'status', value: 'status' } },
            'value',
        ],
        [
            'an unknown slot',
            { fieldMapping: { category: 'status', value: 'n', size: 'n' } },
            'size',
        ],
    ])('refuses %s, naming it', async (_, config, named) => {
        const { service, composerChartModel } = setup();
        await expect(
            service.create(
                sessionAccount(abilityWithout(null)),
                projectUuid,
                customChartBody(config),
            ),
        ).rejects.toThrow(named);
        expect(composerChartModel.create).not.toHaveBeenCalled();
    });
});

describe('ComposerChartService.run', () => {
    const viewer = () =>
        sessionAccount(
            new Ability<PossibleAbilities>([
                { subject: 'SavedChart', action: 'view' as const },
            ]),
        );
    const runRequest = {
        dashboardUuid,
        tileUuid: 'tile-uuid',
        dashboardFilters: {
            dimensions: [],
            metrics: [],
            tableCalculations: [],
        },
        parameters: {},
        excludedParameterKeys: [],
        invalidateCache: false,
        dateZoom: null,
    };
    const setupRun = (
        options: {
            flagEnabled?: boolean;
            chart?: CreateComposerChart['chart'];
            nodes?: ComposerChartPipelineNode[];
        } = {},
    ) => {
        const {
            service,
            composerChartModel,
            querySourceService,
            asyncQueryService,
        } = setup(options);
        const body = createBody(options.nodes ?? PIPELINES.python);
        const stored = body.pipeline;
        const owner: ComposerChartOwner = { type: 'dashboard', dashboardUuid };
        const getOwner = vi.fn(
            async (): Promise<{
                projectUuid: string;
                owner: ComposerChartOwner;
            }> => ({ projectUuid, owner }),
        );
        Object.assign(composerChartModel, {
            getOwner,
            get: vi.fn(async () => ({
                uuid: 'chart-uuid',
                projectUuid,
                owner,
                pipeline: stored,
                chart: options.chart ?? body.chart,
            })),
        });
        const { submitComposerRun } = querySourceService;
        // Semantic-layer nodes carry the tile's resolved parameters, none here
        const resolvedNodes = stored.nodes.map((node) =>
            node.sourceType === QuerySourceType.SEMANTIC_LAYER
                ? { ...node, parameters: {} }
                : node,
        );
        return {
            service,
            stored,
            resolvedNodes,
            submitComposerRun,
            asyncQueryService,
            getOwner,
        };
    };

    test('resolves the dashboard saved filters and parameter state for a run without app state', async () => {
        const { service, asyncQueryService, submitComposerRun } = setupRun();
        await service.runWithSavedDashboardState(
            viewer(),
            projectUuid,
            'chart-uuid',
            { dashboardUuid, tileUuid: 'tile-uuid', invalidateCache: false },
        );
        expect(asyncQueryService.getComposerTileContext).toHaveBeenCalledWith(
            expect.objectContaining({
                dashboardFilters: savedDashboardFilters,
                parameters: undefined,
                excludedParameterKeys: undefined,
            }),
        );
        expect(submitComposerRun).toHaveBeenCalledWith(
            expect.objectContaining({ context: QueryExecutionContext.AI }),
        );
    });

    test('runs the stored pipeline for a dashboard viewer and returns every node query', async () => {
        const { service, stored, resolvedNodes, submitComposerRun } =
            setupRun();
        const account = viewer();
        const result = await service.run(
            account,
            projectUuid,
            'chart-uuid',
            runRequest,
            QueryExecutionContext.DASHBOARD,
        );
        expect(result.queries.map(({ nodeId }) => nodeId)).toEqual(
            stored.nodes.map(({ nodeId }) => nodeId),
        );
        const { binding } = submitComposerRun.mock.calls[0][0];
        expect(binding.nodes).toEqual(resolvedNodes);
        expect(binding.stamp).toEqual({
            composerChartUuid: 'chart-uuid',
            dashboardUuid,
            tileUuid: 'tile-uuid',
        });
        expect(() =>
            binding.assertExecution(account, projectUuid),
        ).not.toThrow();
        expect(() =>
            binding.assertExecution(account, 'another-project'),
        ).toThrow(ForbiddenError);
        expect(result.chartStageQueryUuid).toBeNull();
    });

    test('returns the terminal node’s fields map from its run', async () => {
        const { service } = setupRun();
        const result = await service.run(
            viewer(),
            projectUuid,
            'chart-uuid',
            runRequest,
            QueryExecutionContext.DASHBOARD,
        );
        expect(result.fields).toEqual({ 'result-query_field': {} });
    });

    test('runs a server-built series-split stage after the terminal node for a chart with a group-by', async () => {
        const { service, resolvedNodes, submitComposerRun } = setupRun({
            chart: {
                schemaVersion: 1,
                columns: [
                    { reference: 'month', fieldType: FieldType.DIMENSION },
                    { reference: 'method', fieldType: FieldType.DIMENSION },
                    { reference: 'n', fieldType: FieldType.METRIC },
                ],
                chartConfig: {
                    type: ChartType.CARTESIAN,
                    config: {
                        layout: { xField: 'month', yField: ['n'] },
                        eChartsConfig: { series: [] },
                    },
                },
                pivotConfig: { columns: ['method'] },
                tableConfig: { columnOrder: [] },
            },
        });
        const result = await service.run(
            viewer(),
            projectUuid,
            'chart-uuid',
            runRequest,
            QueryExecutionContext.DASHBOARD,
        );
        const { binding } = submitComposerRun.mock.calls[0][0];
        expect(binding.nodes.slice(0, -1)).toEqual(resolvedNodes);
        expect(binding.nodes.at(-1)).toMatchObject({
            nodeId: 'chart_stage',
            sourceType: QuerySourceType.DUCKDB,
            references: { node_result: 'result' },
        });
        expect(result.chartStageQueryUuid).toBe('chart_stage-query');
        expect(result.fields).toEqual({ 'result-query_field': {} });
    });

    test('zooms each semantic-layer node with a date dimension and reports the zoom applied', async () => {
        const { service, submitComposerRun } = setupRun({
            nodes: PIPELINES.python.map((node) =>
                node.nodeId === 'orders'
                    ? semantic({
                          dimensions: ['orders_status', 'orders_created_at'],
                      })
                    : node,
            ),
        });
        const zoomed = await service.run(
            viewer(),
            projectUuid,
            'chart-uuid',
            { ...runRequest, dateZoom: { granularity: DateGranularity.MONTH } },
            QueryExecutionContext.DASHBOARD,
        );
        expect(
            submitComposerRun.mock.calls[0][0].binding.dateZoomByNodeId,
        ).toEqual({
            orders: {
                granularity: DateGranularity.MONTH,
                xAxisFieldId: 'orders_created_at',
            },
        });
        expect(zoomed.dateZoomApplied).toBe(true);
        expect(zoomed.zoomedFieldLabels).toEqual({
            orders_created_at: 'Created at month',
        });
        expect(zoomed.zoomableFields).toEqual([
            {
                fieldId: 'orders_created_at',
                label: 'orders_created_at',
                tableName: 'orders',
            },
        ]);

        const unzoomed = await service.run(
            viewer(),
            projectUuid,
            'chart-uuid',
            runRequest,
            QueryExecutionContext.DASHBOARD,
        );
        expect(
            submitComposerRun.mock.calls[1][0].binding.dateZoomByNodeId,
        ).toEqual({});
        expect(unzoomed.dateZoomApplied).toBe(false);
        expect(unzoomed.zoomedFieldLabels).toEqual({});
        expect(unzoomed.zoomableFields).toEqual(zoomed.zoomableFields);
    });

    test("zooms the stored chart's x-axis field when the tile names none", async () => {
        const body = createBody(PIPELINES.python);
        const { service, submitComposerRun } = setupRun({
            nodes: PIPELINES.python.map((node) =>
                node.nodeId === 'orders'
                    ? semantic({
                          dimensions: [
                              'orders_created_at',
                              'orders_shipped_at',
                          ],
                      })
                    : node,
            ),
            chart: {
                ...body.chart,
                chartConfig: {
                    type: ChartType.CARTESIAN,
                    config: {
                        layout: { xField: 'orders_shipped_at', yField: ['n'] },
                        eChartsConfig: { series: [] },
                    },
                },
            },
        });
        await service.run(
            viewer(),
            projectUuid,
            'chart-uuid',
            { ...runRequest, dateZoom: { granularity: DateGranularity.WEEK } },
            QueryExecutionContext.DASHBOARD,
        );
        expect(
            submitComposerRun.mock.calls[0][0].binding.dateZoomByNodeId,
        ).toEqual({
            orders: {
                granularity: DateGranularity.WEEK,
                xAxisFieldId: 'orders_shipped_at',
            },
        });
    });

    test('returns the parameter values each node query ran with', async () => {
        const { service } = setupRun();
        const result = await service.run(
            viewer(),
            projectUuid,
            'chart-uuid',
            runRequest,
            QueryExecutionContext.DASHBOARD,
        );
        expect(result.usedParameterValuesByNodeId).toEqual({
            orders: { region: 'EU' },
            other: { region: 'UK' },
            result: {},
        });
    });

    test('writes the dashboard parameter onto the nodes and the shared map', async () => {
        const { service, submitComposerRun } = setupRun();
        const result = await service.run(
            viewer(),
            projectUuid,
            'chart-uuid',
            {
                ...runRequest,
                parameters: { region: 'EU' },
            },
            QueryExecutionContext.DASHBOARD,
        );
        const { binding } = submitComposerRun.mock.calls[0][0];
        expect(binding.parameters).toEqual({ region: 'EU' });
        expect(binding.nodes[0]).toMatchObject({
            sourceType: QuerySourceType.SEMANTIC_LAYER,
            parameters: { region: 'EU' },
        });
        expect(result.appliedDashboardFilters).toEqual(
            runRequest.dashboardFilters,
        );
    });

    test("applies a dashboard filter's SQL column target to a SQL node that returned the column", async () => {
        const { service } = setupRun({ nodes: PIPELINES.sql });
        const columnTarget = {
            fieldId: 'status',
            tableName: 'result',
            isSqlColumn: true,
        };
        const columnRule: DashboardFilterRule = {
            id: 'status-filter',
            label: undefined,
            target: { fieldId: 'orders_status', tableName: 'orders' },
            tileTargets: { 'tile-uuid': columnTarget },
            operator: FilterOperator.EQUALS,
            values: ['shipped'],
        };
        const dashboardFilters: DashboardFilters = {
            dimensions: [columnRule],
            metrics: [],
            tableCalculations: [],
        };
        const result = await service.run(
            viewer(),
            projectUuid,
            'chart-uuid',
            { ...runRequest, dashboardFilters },
            QueryExecutionContext.DASHBOARD,
        );
        expect(result.sqlColumns).toEqual([
            { reference: 'status', type: DimensionType.STRING },
        ]);
        const applied = {
            dimensions: [
                {
                    ...columnRule,
                    target: columnTarget,
                    settings: { sourceTarget: columnRule.target },
                },
            ],
            metrics: [],
            tableCalculations: [],
        };
        expect(result.appliedDashboardFiltersByNodeId).toEqual({
            result: applied,
        });
        expect(result.appliedDashboardFilters).toEqual(applied);
    });

    test('refuses a caller who cannot view the owning dashboard', async () => {
        const { service, submitComposerRun } = setupRun();
        await expect(
            service.run(
                sessionAccount(new Ability<PossibleAbilities>([])),
                projectUuid,
                'chart-uuid',
                runRequest,
                QueryExecutionContext.DASHBOARD,
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(submitComposerRun).not.toHaveBeenCalled();
    });

    test('refuses a dashboard viewer without view on charts', async () => {
        const { service, submitComposerRun } = setupRun();
        await expect(
            service.run(
                sessionAccount(
                    new Ability<PossibleAbilities>([
                        { subject: 'Dashboard', action: 'view' as const },
                    ]),
                ),
                projectUuid,
                'chart-uuid',
                runRequest,
                QueryExecutionContext.DASHBOARD,
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(submitComposerRun).not.toHaveBeenCalled();
    });

    test('refuses a tile run of a chart a space owns', async () => {
        const { service, submitComposerRun, getOwner } = setupRun();
        getOwner.mockResolvedValue({
            projectUuid,
            owner: { type: 'space', spaceUuid: 'space-uuid' },
        });
        await expect(
            service.run(
                viewer(),
                projectUuid,
                'chart-uuid',
                runRequest,
                QueryExecutionContext.DASHBOARD,
            ),
        ).rejects.toThrow('not on that dashboard tile');
        expect(submitComposerRun).not.toHaveBeenCalled();
    });

    test('refuses a run naming a dashboard that does not own the chart', async () => {
        const { service, submitComposerRun } = setupRun();
        await expect(
            service.run(
                viewer(),
                projectUuid,
                'chart-uuid',
                {
                    ...runRequest,
                    dashboardUuid: 'another-dashboard',
                },
                QueryExecutionContext.DASHBOARD,
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(submitComposerRun).not.toHaveBeenCalled();
    });

    test('refuses a run naming a tile that does not show this chart', async () => {
        const { service, submitComposerRun } = setupRun();
        await expect(
            service.run(
                viewer(),
                projectUuid,
                'chart-uuid',
                {
                    ...runRequest,
                    tileUuid: 'another-tile',
                },
                QueryExecutionContext.DASHBOARD,
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(submitComposerRun).not.toHaveBeenCalled();
    });

    test('is refused with the composer-charts flag off', async () => {
        const { service, submitComposerRun } = setupRun({ flagEnabled: false });
        await expect(
            service.run(
                viewer(),
                projectUuid,
                'chart-uuid',
                runRequest,
                QueryExecutionContext.DASHBOARD,
            ),
        ).rejects.toThrow(FeatureNotEnabledError);
        expect(submitComposerRun).not.toHaveBeenCalled();
    });

    test.each([
        QueryExecutionContext.DASHBOARD,
        QueryExecutionContext.SCHEDULED_DELIVERY,
        QueryExecutionContext.CSV,
    ] as const)('records the run under the %s context', async (context) => {
        const { service, submitComposerRun } = setupRun();
        await service.run(
            viewer(),
            projectUuid,
            'chart-uuid',
            runRequest,
            context,
        );
        expect(submitComposerRun.mock.calls[0][0].context).toBe(context);
    });
});

describe('ComposerChartService.getParameterReferences', () => {
    const setupLookup = ({ flagEnabled = true } = {}) => {
        const { service, composerChartModel } = setup({ flagEnabled });
        const nodes = [
            semantic({ parameters: { region: 'eu' } }),
            {
                sourceType: QuerySourceType.SQL,
                nodeId: 'raw',
                title: 'Raw',
                sql: 'select ${lightdash.parameters.currency} as currency',
            },
        ] satisfies ComposerChartPipelineNode[];
        Object.assign(composerChartModel, {
            getOwner: vi.fn(async () => ({
                projectUuid,
                owner: { type: 'dashboard', dashboardUuid },
            })),
            get: vi.fn(async () => ({
                uuid: 'chart-uuid',
                pipeline: { schemaVersion: 1, terminalNodeId: 'raw', nodes },
            })),
        });
        return service;
    };
    const projectDefinitions = {
        currency: { label: 'Currency' },
        unused: { label: 'Unused' },
    };

    test('lists the stored nodes’ parameters and saved values without a run', async () => {
        const result = await setupLookup().getParameterReferences(
            sessionAccount(
                new Ability<PossibleAbilities>([
                    { subject: 'SavedChart', action: 'view' as const },
                ]),
            ),
            projectUuid,
            ['chart-uuid'],
            projectDefinitions,
        );
        expect(result.get('chart-uuid')).toEqual({
            parameterReferences: ['currency'],
            parameterDefinitions: { currency: { label: 'Currency' } },
            chartSavedValues: { region: 'eu' },
            virtualViewSavedValues: {},
            error: null,
        });
    });

    test('refuses the lookup while composer charts are off', async () => {
        await expect(
            setupLookup({ flagEnabled: false }).getParameterReferences(
                sessionAccount(
                    new Ability<PossibleAbilities>([
                        { subject: 'SavedChart', action: 'view' as const },
                    ]),
                ),
                projectUuid,
                ['chart-uuid'],
                projectDefinitions,
            ),
        ).rejects.toThrow(FeatureNotEnabledError);
    });

    test('fails a chart the viewer cannot view', async () => {
        const result = await setupLookup().getParameterReferences(
            sessionAccount(new Ability<PossibleAbilities>([])),
            projectUuid,
            ['chart-uuid'],
            projectDefinitions,
        );
        expect(result.get('chart-uuid')).toEqual({
            parameterReferences: null,
            error: expect.any(String),
        });
    });
});

describe('ComposerChartService.get', () => {
    const setupGet = (owner: ComposerChartOwner) => {
        const { service, composerChartModel, spacePermissionService } = setup();
        Object.assign(composerChartModel, {
            getOwner: vi.fn(async () => ({ projectUuid, owner })),
        });
        return { service, composerChartModel, spacePermissionService };
    };
    const chartViewer = () =>
        sessionAccount(
            new Ability<PossibleAbilities>([
                { subject: 'SavedChart', action: 'view' as const },
            ]),
        );
    const dashboardViewer = () =>
        sessionAccount(
            new Ability<PossibleAbilities>([
                { subject: 'Dashboard', action: 'view' as const },
            ]),
        );
    const spaceOwner: ComposerChartOwner = {
        type: 'space',
        spaceUuid: 'space-uuid',
    };

    test('reads a dashboard chart through the dashboard for a role that can view charts but not dashboards', async () => {
        const { service, spacePermissionService } = setupGet({
            type: 'dashboard',
            dashboardUuid,
        });
        await expect(
            service.get(chartViewer(), projectUuid, 'chart-uuid'),
        ).resolves.toEqual({ uuid: 'chart-uuid' });
        expect(spacePermissionService.resolveAccess).toHaveBeenCalledWith(
            defaultSessionUser.userUuid,
            { type: 'dashboard', dashboardUuid, spaceUuid: 'space-uuid' },
        );
    });

    test.each([
        ['a dashboard', { type: 'dashboard', dashboardUuid }],
        ['a space', { type: 'space', spaceUuid: 'space-uuid' }],
    ] as const)(
        'refuses a role that can view dashboards but not charts, for a chart %s owns',
        async (_, owner) => {
            const { service } = setupGet(owner);
            await expect(
                service.get(dashboardViewer(), projectUuid, 'chart-uuid'),
            ).rejects.toThrow(ForbiddenError);
        },
    );

    test('reads a space chart through its space', async () => {
        const { service, spacePermissionService } = setupGet(spaceOwner);
        await expect(
            service.get(chartViewer(), projectUuid, 'chart-uuid'),
        ).resolves.toEqual({ uuid: 'chart-uuid' });
        expect(spacePermissionService.resolveAccess).toHaveBeenCalledWith(
            defaultSessionUser.userUuid,
            { type: 'space', spaceUuid: 'space-uuid' },
        );
    });

    test('refuses a space chart whose space is deleted', async () => {
        const { service, spacePermissionService, composerChartModel } =
            setupGet(spaceOwner);
        spacePermissionService.resolveAccess.mockRejectedValue(
            new NotFoundError("Couldn't find access context for space"),
        );
        await expect(
            service.get(chartViewer(), projectUuid, 'chart-uuid'),
        ).rejects.toThrow(NotFoundError);
        expect(composerChartModel.get).not.toHaveBeenCalled();
    });

    test('refuses a space chart whose space is in another project', async () => {
        const { service, spacePermissionService } = setupGet(spaceOwner);
        spacePermissionService.resolveAccess.mockResolvedValue({
            organizationUuid,
            projectUuid: 'another-project',
            inheritsFromOrgOrProject: true,
            access: [],
            admins: [],
        });
        await expect(
            service.get(chartViewer(), projectUuid, 'chart-uuid'),
        ).rejects.toThrow(NotFoundError);
    });
});
