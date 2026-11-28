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
    NotSupportedError,
    ParameterError,
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
    type LightdashProjectParameter,
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
import type { ProjectParametersModel } from '../../models/ProjectParametersModel';
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

const setup = ({ flagEnabled = true, softDeleteEnabled = false } = {}) => {
    const querySourceService = {
        submitComposerRun: vi.fn(
            async ({
                binding,
            }: {
                binding: ComposerRunBinding;
                context: QueryExecutionContext;
                invalidateCache: boolean;
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
    const dashboardModel = {
        getSummaryByUuid: vi.fn(async () => ({
            projectUuid,
            organizationUuid,
            spaceUuid: 'space-uuid',
        })),
        getByIdOrSlug: vi.fn(async (uuidOrSlug: string) => ({
            uuid: uuidOrSlug,
            name: 'Sales',
            filters: savedDashboardFilters,
            tiles: [
                {
                    uuid: 'tile-uuid',
                    type: DashboardTileTypes.COMPOSER_CHART,
                    properties: { composerChartUuid: 'chart-uuid' },
                },
            ],
        })),
    };
    const projectParametersModel = {
        find: vi.fn(async () => [
            {
                name: 'region',
                config: { label: 'Region', options: ['EU', 'UK'] },
            },
        ]),
    };
    const service = new ComposerChartService({
        composerChartModel: composerChartModel as unknown as ComposerChartModel,
        projectParametersModel:
            projectParametersModel as unknown as ProjectParametersModel,
        appModel: appModel as unknown as AppModel,
        dashboardModel: dashboardModel as unknown as DashboardModel,
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
        lightdashConfig: {
            softDelete: { enabled: softDeleteEnabled, retentionDays: 30 },
        },
    });
    return {
        service,
        composerChartModel,
        querySourceService,
        asyncQueryService,
        spacePermissionService,
        dashboardModel,
        projectParametersModel,
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

describe('ComposerChartService.create owner', () => {
    const spaceUuid = '7c3f6a52-1d2b-4c8e-9f0a-3b5d7e9f1a2c';
    const spaceBody = (): CreateComposerChart => ({
        ...createBody(PIPELINES.sql),
        dashboardUuid: null,
        spaceUuid,
    });

    test('creates a chart the space owns when no dashboard is named, checked on the space', async () => {
        const { service, composerChartModel, spacePermissionService } = setup();
        await service.create(
            sessionAccount(abilityWithout(null)),
            projectUuid,
            spaceBody(),
        );
        expect(spacePermissionService.resolveAccess).toHaveBeenCalledWith(
            defaultSessionUser.userUuid,
            { type: 'space', spaceUuid },
        );
        expect(composerChartModel.create).toHaveBeenCalledWith(
            expect.objectContaining({
                owner: { type: 'space', spaceUuid },
            }),
        );
    });

    test('ignores the space, even a malformed one, when a dashboard is named', async () => {
        const { service, composerChartModel } = setup();
        await service.create(
            sessionAccount(abilityWithout(null)),
            projectUuid,
            { ...createBody(PIPELINES.sql), spaceUuid: 'not-a-uuid' },
        );
        expect(composerChartModel.create).toHaveBeenCalledWith(
            expect.objectContaining({
                owner: { type: 'dashboard', dashboardUuid },
            }),
        );
    });

    test.each([
        ['both null', { dashboardUuid: null, spaceUuid: null }],
        ['both missing', {}],
        ['a malformed space', { dashboardUuid: null, spaceUuid: 'space-uuid' }],
    ])('refuses a create naming no usable owner: %s', async (_, owner) => {
        const { service, composerChartModel } = setup();
        const { dashboardUuid: _d, ...body } = createBody(PIPELINES.sql);
        await expect(
            service.create(sessionAccount(abilityWithout(null)), projectUuid, {
                ...body,
                ...owner,
            }),
        ).rejects.toThrow(ParameterError);
        expect(composerChartModel.create).not.toHaveBeenCalled();
    });

    test('refuses a space in another project', async () => {
        const { service, composerChartModel, spacePermissionService } = setup();
        spacePermissionService.resolveAccess.mockResolvedValue({
            organizationUuid,
            projectUuid: 'another-project',
            inheritsFromOrgOrProject: true,
            access: [],
            admins: [],
        });
        await expect(
            service.create(
                sessionAccount(abilityWithout(null)),
                projectUuid,
                spaceBody(),
            ),
        ).rejects.toThrow(NotFoundError);
        expect(composerChartModel.create).not.toHaveBeenCalled();
    });

    test('refuses an author who can view charts in the space but not save them', async () => {
        const { service, composerChartModel } = setup();
        const ability = new Ability<PossibleAbilities>([
            { subject: 'SavedChart', action: 'view' as const },
            ...AUTHOR_SUBJECTS.map((name) => ({
                subject: name,
                action: 'manage' as const,
            })),
        ]);
        await expect(
            service.create(sessionAccount(ability), projectUuid, spaceBody()),
        ).rejects.toThrow(ForbiddenError);
        expect(composerChartModel.create).not.toHaveBeenCalled();
    });

    test('is refused with the composer-charts flag off', async () => {
        const { service, composerChartModel } = setup({ flagEnabled: false });
        await expect(
            service.create(
                sessionAccount(abilityWithout(null)),
                projectUuid,
                spaceBody(),
            ),
        ).rejects.toThrow(FeatureNotEnabledError);
        expect(composerChartModel.create).not.toHaveBeenCalled();
    });
});

describe('ComposerChartService.writeFromCode owner', () => {
    const spaceUuid = 'chart-space-uuid';
    const setupLive = (owner: ComposerChartOwner) => {
        const deps = setup();
        const writeFromCode = vi.fn(async () => 'chart-uuid');
        Object.assign(deps.composerChartModel, {
            findIdentityBySlug: vi.fn(async () => ({
                uuid: 'chart-uuid',
                deleted: false,
                owner,
            })),
            getOwner: vi.fn(async () => ({ projectUuid, owner })),
            writeFromCode,
        });
        return { ...deps, writeFromCode };
    };
    const write = (
        service: ComposerChartService,
        spaceOwner: 'refuse' | 'keep',
        ability = abilityWithout(null),
    ) =>
        service.writeFromCode(sessionAccount(ability), projectUuid, {
            ...createBody(PIPELINES.sql),
            slug: 'orders',
            owner: null,
            spaceOwner,
        });

    test('writes a version of a chart its space owns for the agent edit, checked on the space', async () => {
        const { service, writeFromCode, spacePermissionService } = setupLive({
            type: 'space',
            spaceUuid,
        });
        await write(service, 'keep');
        expect(spacePermissionService.resolveAccess).toHaveBeenCalledWith(
            defaultSessionUser.userUuid,
            { type: 'space', spaceUuid },
        );
        expect(writeFromCode).toHaveBeenCalledWith(
            expect.objectContaining({
                owner: { type: 'space', spaceUuid },
            }),
        );
    });

    test('refuses a chart its space owns for promote', async () => {
        const { service, writeFromCode } = setupLive({
            type: 'space',
            spaceUuid,
        });
        await expect(write(service, 'refuse')).rejects.toThrow(
            NotSupportedError,
        );
        expect(writeFromCode).not.toHaveBeenCalled();
    });

    test.each([
        ['manage:ComposerChart', abilityWithout('ComposerChart')],
        [
            'write on its space',
            new Ability<PossibleAbilities>([
                { subject: 'SavedChart', action: 'view' as const },
                ...AUTHOR_SUBJECTS.map((name) => ({
                    subject: name,
                    action: 'manage' as const,
                })),
            ]),
        ],
    ])('refuses the agent edit without %s', async (_, ability) => {
        const { service, writeFromCode } = setupLive({
            type: 'space',
            spaceUuid,
        });
        await expect(write(service, 'keep', ability)).rejects.toThrow(
            ForbiddenError,
        );
        expect(writeFromCode).not.toHaveBeenCalled();
    });

    test.each([
        ['a new chart', null],
        [
            'a deleted chart',
            {
                uuid: 'chart-uuid',
                deleted: true,
                owner: { type: 'dashboard', dashboardUuid },
            },
        ],
    ])(
        'writes %s into the space the file names, checked as a create there',
        async (_, existing) => {
            const deps = setup();
            const writeFromCode = vi.fn(async () => 'chart-uuid');
            Object.assign(deps.composerChartModel, {
                findIdentityBySlug: vi.fn(async () => existing),
                writeFromCode,
            });
            await deps.service.writeFromCode(
                sessionAccount(abilityWithout(null)),
                projectUuid,
                {
                    ...createBody(PIPELINES.sql),
                    slug: 'orders',
                    owner: { type: 'space', spaceUuid },
                    spaceOwner: 'refuse',
                },
            );
            expect(
                deps.spacePermissionService.resolveAccess,
            ).toHaveBeenCalledWith(defaultSessionUser.userUuid, {
                type: 'space',
                spaceUuid,
            });
            expect(writeFromCode).toHaveBeenCalledWith(
                expect.objectContaining({
                    existing,
                    owner: { type: 'space', spaceUuid },
                }),
            );
        },
    );

    test('keeps a dashboard owner either way', async () => {
        const { service, writeFromCode } = setupLive({
            type: 'dashboard',
            dashboardUuid,
        });
        await write(service, 'keep');
        expect(writeFromCode).toHaveBeenCalledWith(
            expect.objectContaining({
                owner: { type: 'dashboard', dashboardUuid },
            }),
        );
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
            dashboardModel,
            spacePermissionService,
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
            dashboardModel,
            spacePermissionService,
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

    test('runs on the requested dashboard, whose tile shows a chart another dashboard owns', async () => {
        const { service, submitComposerRun, asyncQueryService } = setupRun();
        await service.run(
            viewer(),
            projectUuid,
            'chart-uuid',
            { ...runRequest, dashboardUuid: 'showing-dashboard' },
            QueryExecutionContext.DASHBOARD,
        );
        expect(asyncQueryService.getComposerTileContext).toHaveBeenCalledWith(
            expect.objectContaining({ dashboardUuid: 'showing-dashboard' }),
        );
        expect(submitComposerRun.mock.calls[0][0].binding.stamp).toEqual({
            composerChartUuid: 'chart-uuid',
            dashboardUuid: 'showing-dashboard',
            tileUuid: 'tile-uuid',
        });
    });

    test('refuses a dashboard named by slug, as the field takes a uuid', async () => {
        const { service, submitComposerRun, dashboardModel } = setupRun();
        dashboardModel.getByIdOrSlug.mockImplementation(async () => ({
            uuid: dashboardUuid,
            name: 'Sales',
            filters: savedDashboardFilters,
            tiles: [
                {
                    uuid: 'tile-uuid',
                    type: DashboardTileTypes.COMPOSER_CHART,
                    properties: { composerChartUuid: 'chart-uuid' },
                },
            ],
        }));
        await expect(
            service.run(
                viewer(),
                projectUuid,
                'chart-uuid',
                { ...runRequest, dashboardUuid: 'dashboard-slug' },
                QueryExecutionContext.DASHBOARD,
            ),
        ).rejects.toThrow('not on that dashboard tile');
        expect(submitComposerRun).not.toHaveBeenCalled();
    });

    test('refuses a dashboard missing from the project with the tile error', async () => {
        const { service, submitComposerRun, dashboardModel } = setupRun();
        dashboardModel.getByIdOrSlug.mockRejectedValue(
            new NotFoundError('Dashboard not found'),
        );
        await expect(
            service.run(
                viewer(),
                projectUuid,
                'chart-uuid',
                { ...runRequest, dashboardUuid: 'missing-dashboard' },
                QueryExecutionContext.DASHBOARD,
            ),
        ).rejects.toThrow('not on that dashboard tile');
        expect(submitComposerRun).not.toHaveBeenCalled();
    });

    test('runs a tile of a chart a space owns, checking view on its space', async () => {
        const { service, submitComposerRun, getOwner, spacePermissionService } =
            setupRun();
        getOwner.mockResolvedValue({
            projectUuid,
            owner: { type: 'space', spaceUuid: 'space-uuid' },
        });
        await service.run(
            viewer(),
            projectUuid,
            'chart-uuid',
            runRequest,
            QueryExecutionContext.DASHBOARD,
        );
        expect(spacePermissionService.resolveAccess).toHaveBeenCalledWith(
            expect.anything(),
            { type: 'space', spaceUuid: 'space-uuid' },
        );
        expect(submitComposerRun).toHaveBeenCalledTimes(1);
    });

    test('refuses a run naming a dashboard whose tiles do not show the chart', async () => {
        const { service, submitComposerRun, dashboardModel } = setupRun();
        dashboardModel.getByIdOrSlug.mockResolvedValue({
            uuid: 'another-dashboard',
            name: 'Another',
            filters: savedDashboardFilters,
            tiles: [
                {
                    uuid: 'tile-uuid',
                    type: DashboardTileTypes.COMPOSER_CHART,
                    properties: { composerChartUuid: 'another-chart' },
                },
            ],
        });
        await expect(
            service.run(
                viewer(),
                projectUuid,
                'chart-uuid',
                { ...runRequest, dashboardUuid: 'another-dashboard' },
                QueryExecutionContext.DASHBOARD,
            ),
        ).rejects.toThrow('not on that dashboard tile');
        expect(submitComposerRun).not.toHaveBeenCalled();
    });

    test('runs the chart a dashboard composer chart request names', async () => {
        const { service, submitComposerRun } = setupRun();
        await service.runTile(
            viewer(),
            projectUuid,
            { ...runRequest, composerChartUuid: 'chart-uuid' },
            QueryExecutionContext.DASHBOARD,
        );
        expect(submitComposerRun.mock.calls[0][0].binding.stamp).toEqual({
            composerChartUuid: 'chart-uuid',
            dashboardUuid,
            tileUuid: 'tile-uuid',
        });
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

describe('ComposerChartService.runChart', () => {
    const spaceOwner: ComposerChartOwner = {
        type: 'space',
        spaceUuid: 'space-uuid',
    };
    const viewer = () =>
        sessionAccount(
            new Ability<PossibleAbilities>([
                { subject: 'SavedChart', action: 'view' as const },
            ]),
        );
    const setupChartRun = (
        options: {
            flagEnabled?: boolean;
            nodes?: ComposerChartPipelineNode[];
            owner?: ComposerChartOwner;
        } = {},
    ) => {
        const context = setup(options);
        const body = createBody(options.nodes ?? PIPELINES.python);
        const owner = options.owner ?? spaceOwner;
        Object.assign(context.composerChartModel, {
            getOwner: vi.fn(async () => ({ projectUuid, owner })),
            get: vi.fn(async () => ({
                uuid: 'chart-uuid',
                projectUuid,
                owner,
                pipeline: body.pipeline,
                chart: body.chart,
            })),
        });
        return context;
    };
    const request = {
        composerChartUuid: 'chart-uuid',
        invalidateCache: false,
    };

    test('runs a chart a space owns with no dashboard or tile on its stamp, checking view on its space', async () => {
        const {
            service,
            querySourceService,
            spacePermissionService,
            dashboardModel,
            asyncQueryService,
        } = setupChartRun();
        const result = await service.runChart(
            viewer(),
            projectUuid,
            request,
            QueryExecutionContext.COMPOSER_CHART_VIEW,
        );
        expect(spacePermissionService.resolveAccess).toHaveBeenCalledWith(
            expect.anything(),
            { type: 'space', spaceUuid: 'space-uuid' },
        );
        const [{ binding, context }] =
            querySourceService.submitComposerRun.mock.calls[0];
        expect(context).toBe(QueryExecutionContext.COMPOSER_CHART_VIEW);
        expect(binding.stamp).toEqual({
            composerChartUuid: 'chart-uuid',
            dashboardUuid: null,
            tileUuid: null,
        });
        expect(binding.dateZoomByNodeId).toEqual({});
        expect(dashboardModel.getByIdOrSlug).not.toHaveBeenCalled();
        expect(asyncQueryService.getComposerTileContext).not.toHaveBeenCalled();
        expect(result).toMatchObject({
            appliedDashboardFilters: {
                dimensions: [],
                metrics: [],
                tableCalculations: [],
            },
            appliedDashboardFiltersByNodeId: {},
            dateZoomApplied: false,
            zoomableFields: [],
        });
        expect(result.queries.map(({ nodeId }) => nodeId)).toEqual([
            'orders',
            'other',
            'result',
        ]);
    });

    test('refuses a chart a dashboard owns, naming its dashboard', async () => {
        const { service, querySourceService } = setupChartRun({
            owner: { type: 'dashboard', dashboardUuid },
        });
        await expect(
            service.runChart(
                viewer(),
                projectUuid,
                request,
                QueryExecutionContext.COMPOSER_CHART_VIEW,
            ),
        ).rejects.toThrow(/dashboard "Sales"/);
        expect(querySourceService.submitComposerRun).not.toHaveBeenCalled();
    });

    test('refuses a caller who cannot view the chart without naming its dashboard', async () => {
        const { service, querySourceService } = setupChartRun({
            owner: { type: 'dashboard', dashboardUuid },
        });
        const refusal = await service
            .runChart(
                sessionAccount(new Ability<PossibleAbilities>([])),
                projectUuid,
                request,
                QueryExecutionContext.COMPOSER_CHART_VIEW,
            )
            .catch((error: unknown) => error);
        expect(refusal).toBeInstanceOf(ForbiddenError);
        expect((refusal as Error).message).not.toContain('Sales');
        expect(querySourceService.submitComposerRun).not.toHaveBeenCalled();
    });

    test('refuses a caller who cannot view the space', async () => {
        const { service, querySourceService } = setupChartRun();
        await expect(
            service.runChart(
                sessionAccount(new Ability<PossibleAbilities>([])),
                projectUuid,
                request,
                QueryExecutionContext.COMPOSER_CHART_VIEW,
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(querySourceService.submitComposerRun).not.toHaveBeenCalled();
    });

    test('runs with the composer-charts flag off', async () => {
        const { service, querySourceService } = setupChartRun({
            flagEnabled: false,
        });
        await service.runChart(
            viewer(),
            projectUuid,
            request,
            QueryExecutionContext.COMPOSER_CHART_VIEW,
        );
        expect(querySourceService.submitComposerRun).toHaveBeenCalledTimes(1);
    });

    describe('parameters', () => {
        const nodes: ComposerChartPipelineNode[] = [
            semantic({ parameters: { region: 'UK' } }),
            {
                sourceType: QuerySourceType.SQL,
                nodeId: 'result',
                title: 'Result',
                sql: 'select ${lightdash.parameters.region}',
            },
        ];
        const runWith = async (
            parameters?: ParametersValuesMap,
            {
                modelParameters,
                projectParameterName,
            }: {
                modelParameters?: Record<string, LightdashProjectParameter>;
                projectParameterName?: string;
            } = {},
        ) => {
            const {
                service,
                querySourceService,
                asyncQueryService,
                projectParametersModel,
            } = setupChartRun({ nodes });
            if (modelParameters) {
                const { getExplore } = asyncQueryService;
                const original = getExplore.getMockImplementation()!;
                getExplore.mockImplementation(async (...args) => {
                    const explore = await original(...args);
                    explore.tables.orders.parameters = modelParameters;
                    return explore;
                });
            }
            if (projectParameterName) {
                projectParametersModel.find.mockResolvedValue([
                    {
                        name: projectParameterName,
                        config: { label: 'Region', options: ['EU', 'UK'] },
                    },
                ]);
            }
            await service.runChart(
                viewer(),
                projectUuid,
                { ...request, ...(parameters && { parameters }) },
                QueryExecutionContext.COMPOSER_CHART_VIEW,
            );
            const [{ binding }] =
                querySourceService.submitComposerRun.mock.calls[0];
            return {
                nodeParameters: binding.nodes.find(
                    (
                        node,
                    ): node is Extract<
                        ComposerChartPipelineNode,
                        { sourceType: QuerySourceType.SEMANTIC_LAYER }
                    > =>
                        node.nodeId === 'orders' &&
                        node.sourceType === QuerySourceType.SEMANTIC_LAYER,
                )?.parameters,
                shared: binding.parameters,
            };
        };

        test('a semantic-layer node runs its saved value, which the shared map does not carry', async () => {
            expect(await runWith()).toEqual({
                nodeParameters: { region: 'UK' },
                shared: {},
            });
        });

        test("a caller's value beats the node's saved value and reaches the shared map", async () => {
            expect(await runWith({ region: 'EU' })).toEqual({
                nodeParameters: { region: 'EU' },
                shared: { region: 'EU' },
            });
        });

        test("a caller's value outside a model parameter's options is dropped from the shared map too", async () => {
            expect(
                await runWith(
                    { 'orders.size': 'huge' },
                    {
                        modelParameters: {
                            size: { label: 'Size', options: ['small'] },
                        },
                    },
                ),
            ).toEqual({ nodeParameters: { region: 'UK' }, shared: {} });
        });

        test("a project parameter keeps a caller value that a model's copy of its name refuses", async () => {
            expect(
                await runWith(
                    { 'orders.region': 'EU' },
                    {
                        projectParameterName: 'orders.region',
                        modelParameters: {
                            region: { label: 'Region', options: ['US'] },
                        },
                    },
                ),
            ).toEqual({
                nodeParameters: { region: 'UK', 'orders.region': 'EU' },
                shared: { 'orders.region': 'EU' },
            });
        });

        test("a caller's value outside the fixed options is dropped everywhere", async () => {
            expect(await runWith({ region: 'MARS' })).toEqual({
                nodeParameters: { region: 'UK' },
                shared: {},
            });
        });
    });
});

describe('ComposerChartService.getParameterReferences', () => {
    const setupLookup = ({ flagEnabled = true } = {}) => {
        const { service, composerChartModel, projectParametersModel } = setup({
            flagEnabled,
        });
        projectParametersModel.find.mockResolvedValue([
            { name: 'currency', config: { label: 'Currency', options: [] } },
        ]);
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

    test('lists the page’s parameters with composer charts off', async () => {
        const service = setupLookup({ flagEnabled: false });
        await expect(
            service.getParameters(
                sessionAccount(
                    new Ability<PossibleAbilities>([
                        { subject: 'SavedChart', action: 'view' as const },
                    ]),
                ),
                projectUuid,
                'chart-uuid',
            ),
        ).resolves.toEqual({
            parameterReferences: ['currency'],
            parameterDefinitions: {
                currency: { label: 'Currency', options: [], type: 'string' },
            },
        });
    });

    test('refuses the page’s parameters to a user who cannot view the chart', async () => {
        await expect(
            setupLookup().getParameters(
                sessionAccount(new Ability<PossibleAbilities>([])),
                projectUuid,
                'chart-uuid',
            ),
        ).rejects.toThrow(ForbiddenError);
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

    const setupGetBySlug = () => {
        const { service, composerChartModel, spacePermissionService } =
            setupGet(spaceOwner);
        const getUuidByUuidOrSlug = vi.fn(async () => 'chart-uuid');
        const getWithDetails = vi.fn(async () => ({ uuid: 'chart-uuid' }));
        Object.assign(composerChartModel, {
            getUuidByUuidOrSlug,
            getWithDetails,
        });
        return {
            service,
            getUuidByUuidOrSlug,
            getWithDetails,
            spacePermissionService,
        };
    };

    test('reads a chart by its slug, checking view on the space that owns it', async () => {
        const { service, getUuidByUuidOrSlug, spacePermissionService } =
            setupGetBySlug();
        await expect(
            service.getWithDetails(chartViewer(), projectUuid, 'orders-chart'),
        ).resolves.toEqual({ uuid: 'chart-uuid' });
        expect(getUuidByUuidOrSlug).toHaveBeenCalledWith(
            projectUuid,
            'orders-chart',
        );
        expect(spacePermissionService.resolveAccess).toHaveBeenCalledWith(
            defaultSessionUser.userUuid,
            { type: 'space', spaceUuid: 'space-uuid' },
        );
    });

    test('refuses a chart read by slug to a user who cannot view charts', async () => {
        const { service, getWithDetails } = setupGetBySlug();
        await expect(
            service.getWithDetails(
                dashboardViewer(),
                projectUuid,
                'orders-chart',
            ),
        ).rejects.toThrow(ForbiddenError);
        expect(getWithDetails).not.toHaveBeenCalled();
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

describe('ComposerChartService lifecycle writes', () => {
    const sourceSpaceUuid = 'source-space-uuid';
    const targetSpaceUuid = 'target-space-uuid';
    const spaceOwner: ComposerChartOwner = {
        type: 'space',
        spaceUuid: sourceSpaceUuid,
    };

    // Write follows `inheritsFromOrgOrProject`, so each space can grant or refuse it
    const setupWrite = ({
        owner = spaceOwner,
        writableSpaces = [sourceSpaceUuid, targetSpaceUuid],
        spaceProjects = {},
        flagEnabled = true,
        softDeleteEnabled = false,
    }: {
        owner?: ComposerChartOwner;
        writableSpaces?: readonly string[];
        spaceProjects?: Record<string, string>;
        flagEnabled?: boolean;
        softDeleteEnabled?: boolean;
    } = {}) => {
        const deps = setup({ flagEnabled, softDeleteEnabled });
        const update = vi.fn(async () => ({ uuid: 'chart-uuid' }));
        const moveToSpace = vi.fn(async () => undefined);
        const deleteFromSpace = vi.fn(async () => undefined);
        Object.assign(deps.composerChartModel, {
            getOwner: vi.fn(async () => ({ projectUuid, owner })),
            update,
            moveToSpace,
            deleteFromSpace,
        });
        const resolveAccess = vi.fn(
            async (_: string, target: { spaceUuid: string }) => ({
                organizationUuid,
                projectUuid: spaceProjects[target.spaceUuid] ?? projectUuid,
                inheritsFromOrgOrProject: writableSpaces.includes(
                    target.spaceUuid,
                ),
                access: [],
                admins: [],
            }),
        );
        Object.assign(deps.spacePermissionService, { resolveAccess });
        const account = sessionAccount(
            new Ability<PossibleAbilities>([
                { subject: 'SavedChart', action: 'view' as const },
                {
                    subject: 'SavedChart',
                    action: 'manage' as const,
                    conditions: { inheritsFromOrgOrProject: true },
                },
            ]),
        );
        return {
            ...deps,
            update,
            moveToSpace,
            deleteFromSpace,
            account,
            resolveAccess,
        };
    };

    describe('delete', () => {
        test.each([
            [
                'soft, by the caller, with soft delete on',
                true,
                defaultSessionUser.userUuid,
            ],
            ['permanently with soft delete off', false, null],
        ])(
            'deletes a chart its space owns %s, with the flag off',
            async (_, softDeleteEnabled, deletedBy) => {
                const { service, account, deleteFromSpace } = setupWrite({
                    softDeleteEnabled,
                    flagEnabled: false,
                });
                await service.delete(account, projectUuid, 'chart-uuid');
                expect(deleteFromSpace).toHaveBeenCalledWith(
                    'chart-uuid',
                    sourceSpaceUuid,
                    deletedBy,
                );
            },
        );

        test('refuses a user who cannot write charts in the space', async () => {
            const { service, account, deleteFromSpace } = setupWrite({
                writableSpaces: [],
            });
            await expect(
                service.delete(account, projectUuid, 'chart-uuid'),
            ).rejects.toThrow(ForbiddenError);
            expect(deleteFromSpace).not.toHaveBeenCalled();
        });

        test('refuses a chart a dashboard owns', async () => {
            const { service, account, deleteFromSpace } = setupWrite({
                owner: { type: 'dashboard', dashboardUuid },
                writableSpaces: ['space-uuid'],
            });
            await expect(
                service.delete(account, projectUuid, 'chart-uuid'),
            ).rejects.toThrow(ParameterError);
            expect(deleteFromSpace).not.toHaveBeenCalled();
        });

        test('misses a chart in another project', async () => {
            const { service, account, deleteFromSpace } = setupWrite();
            await expect(
                service.delete(account, 'another-project', 'chart-uuid'),
            ).rejects.toThrow(NotFoundError);
            expect(deleteFromSpace).not.toHaveBeenCalled();
        });
    });

    describe('getDashboardsShowing', () => {
        test('lists the dashboards showing the chart that the caller can view', async () => {
            const deps = setupWrite();
            const findDashboardsShowing = vi.fn(async () => [
                {
                    uuid: 'visible',
                    name: 'Visible',
                    spaceUuid: sourceSpaceUuid,
                },
                {
                    uuid: 'hidden',
                    name: 'Hidden',
                    spaceUuid: 'private-space',
                },
            ]);
            const resolveAccessBatch = vi.fn(
                async (
                    _: string,
                    targets: { dashboardUuid: string; spaceUuid: string }[],
                ) =>
                    targets.map((target) => ({
                        target,
                        context:
                            target.spaceUuid === 'private-space'
                                ? {
                                      organizationUuid,
                                      projectUuid,
                                      inheritsFromOrgOrProject: false,
                                      access: [],
                                      admins: [],
                                  }
                                : {
                                      organizationUuid,
                                      projectUuid,
                                      inheritsFromOrgOrProject: true,
                                      access: [],
                                      admins: [],
                                  },
                    })),
            );
            Object.assign(deps.composerChartModel, { findDashboardsShowing });
            Object.assign(deps.spacePermissionService, { resolveAccessBatch });
            const account = sessionAccount(
                new Ability<PossibleAbilities>([
                    { subject: 'SavedChart', action: 'view' as const },
                    {
                        subject: 'Dashboard',
                        action: 'view' as const,
                        conditions: { inheritsFromOrgOrProject: true },
                    },
                ]),
            );

            await expect(
                deps.service.getDashboardsShowing(
                    account,
                    projectUuid,
                    'chart-uuid',
                ),
            ).resolves.toEqual([{ uuid: 'visible', name: 'Visible' }]);
        });

        test('refuses a caller who cannot view the chart', async () => {
            const deps = setupWrite();
            const findDashboardsShowing = vi.fn(async () => []);
            Object.assign(deps.composerChartModel, { findDashboardsShowing });
            await expect(
                deps.service.getDashboardsShowing(
                    sessionAccount(new Ability<PossibleAbilities>([])),
                    projectUuid,
                    'chart-uuid',
                ),
            ).rejects.toThrow(ForbiddenError);
            expect(findDashboardsShowing).not.toHaveBeenCalled();
        });
    });

    describe('update', () => {
        test('renames a chart its space owns, checking write on that space', async () => {
            const { service, account, update } = setupWrite();
            await service.update(account, projectUuid, 'chart-uuid', {
                name: ' Renamed ',
                description: null,
            });
            expect(update).toHaveBeenCalledWith('chart-uuid', sourceSpaceUuid, {
                name: 'Renamed',
                description: null,
            });
        });

        test('renames with the composer-charts flag off', async () => {
            const { service, account, update } = setupWrite({
                flagEnabled: false,
            });
            await service.update(account, projectUuid, 'chart-uuid', {
                description: 'Why',
            });
            expect(update).toHaveBeenCalledWith('chart-uuid', sourceSpaceUuid, {
                description: 'Why',
            });
        });

        test('refuses a user who can view charts in the space but not write them', async () => {
            const { service, account, update } = setupWrite({
                writableSpaces: [],
            });
            await expect(
                service.update(account, projectUuid, 'chart-uuid', {
                    name: 'Renamed',
                }),
            ).rejects.toThrow(ForbiddenError);
            expect(update).not.toHaveBeenCalled();
        });

        test.each([
            [
                'a chart a dashboard owns',
                {
                    owner: { type: 'dashboard', dashboardUuid },
                    writableSpaces: ['space-uuid'],
                },
                { name: 'Renamed' },
            ],
            ['an empty name', {}, { name: '  ' }],
        ] as const)('refuses %s', async (_, options, body) => {
            const { service, account, update } = setupWrite(options);
            await expect(
                service.update(account, projectUuid, 'chart-uuid', body),
            ).rejects.toThrow(ParameterError);
            expect(update).not.toHaveBeenCalled();
        });
    });

    describe('preflightSpaceChartEdit', () => {
        test.each([
            ['its own space', [targetSpaceUuid], null],
            ['its own space, moving it', [targetSpaceUuid], targetSpaceUuid],
            ['the target space', [sourceSpaceUuid], targetSpaceUuid],
        ])(
            'refuses a user who cannot write %s',
            async (_, writableSpaces, target) => {
                const { service, account } = setupWrite({ writableSpaces });
                await expect(
                    service.preflightSpaceChartEdit(
                        account,
                        projectUuid,
                        'chart-uuid',
                        { targetSpaceUuid: target },
                    ),
                ).rejects.toThrow(ForbiddenError);
            },
        );

        test('passes with write on both spaces, writing nothing', async () => {
            const { service, account, update, moveToSpace } = setupWrite();
            await service.preflightSpaceChartEdit(
                account,
                projectUuid,
                'chart-uuid',
                { targetSpaceUuid },
            );
            expect(update).not.toHaveBeenCalled();
            expect(moveToSpace).not.toHaveBeenCalled();
        });
    });

    describe('moveToSpace', () => {
        const move = (
            service: ComposerChartService,
            account: ReturnType<typeof sessionAccount>,
            target: string | null = targetSpaceUuid,
        ) =>
            service.moveToSpace(
                account,
                {
                    projectUuid,
                    itemUuid: 'chart-uuid',
                    targetSpaceUuid: target,
                },
                { tx: 'tx' as never },
            );

        test('moves a chart to another space in the caller transaction, checking write on both', async () => {
            const { service, account, moveToSpace, resolveAccess } = setupWrite(
                { flagEnabled: false },
            );
            await move(service, account);
            expect(moveToSpace).toHaveBeenCalledWith(
                {
                    projectUuid,
                    composerChartUuid: 'chart-uuid',
                    sourceSpaceUuid,
                    targetSpaceUuid,
                },
                { tx: 'tx' },
            );
            expect(resolveAccess).toHaveBeenCalledWith(
                defaultSessionUser.userUuid,
                { type: 'space', spaceUuid: sourceSpaceUuid },
            );
            expect(resolveAccess).toHaveBeenCalledWith(
                defaultSessionUser.userUuid,
                { type: 'space', spaceUuid: targetSpaceUuid },
            );
        });

        test.each([
            ['its own space', [targetSpaceUuid]],
            ['the target space', [sourceSpaceUuid]],
        ])('refuses a user who cannot write %s', async (_, writableSpaces) => {
            const { service, account, moveToSpace } = setupWrite({
                writableSpaces,
            });
            await expect(move(service, account)).rejects.toThrow(
                ForbiddenError,
            );
            expect(moveToSpace).not.toHaveBeenCalled();
        });

        test('refuses a target space in another project', async () => {
            const { service, account, moveToSpace } = setupWrite({
                spaceProjects: { [targetSpaceUuid]: 'another-project' },
            });
            await expect(move(service, account)).rejects.toThrow(NotFoundError);
            expect(moveToSpace).not.toHaveBeenCalled();
        });

        // The dashboard's space is writable, so only the owner refuses
        test.each([
            [
                'a chart a dashboard owns',
                { type: 'dashboard', dashboardUuid },
                targetSpaceUuid,
            ],
            ['no target space', spaceOwner, null],
        ] as const)('refuses %s', async (_, owner, target) => {
            const { service, account, moveToSpace } = setupWrite({
                owner,
                writableSpaces: [
                    'space-uuid',
                    sourceSpaceUuid,
                    targetSpaceUuid,
                ],
            });
            await expect(move(service, account, target)).rejects.toThrow(
                ParameterError,
            );
            expect(moveToSpace).not.toHaveBeenCalled();
        });
    });
});

describe('ComposerChartService restore and permanent delete', () => {
    const spaceUuid = 'space-uuid';
    const otherUserUuid = 'other-user-uuid';
    const deletedAt = new Date('2026-11-28T10:00:00.000Z');

    const setupDeleted = ({
        owner = { type: 'space', spaceUuid } as ComposerChartOwner,
        deletedByUserUuid = defaultSessionUser.userUuid,
        canManageDeletedContent = false,
    }: {
        owner?: ComposerChartOwner;
        deletedByUserUuid?: string | null;
        canManageDeletedContent?: boolean;
    } = {}) => {
        const deps = setup({ flagEnabled: false, softDeleteEnabled: true });
        const restoreToSpace = vi.fn(async () => undefined);
        const permanentlyDeleteFromSpace = vi.fn(async () => undefined);
        Object.assign(deps.composerChartModel, {
            getDeleted: vi.fn(async () => ({
                projectUuid,
                organizationUuid,
                owner,
                deletion: { deletedAt, deletedByUserUuid },
            })),
            restoreToSpace,
            permanentlyDeleteFromSpace,
        });
        const account = sessionAccount(
            new Ability<PossibleAbilities>(
                canManageDeletedContent
                    ? [
                          {
                              subject: 'DeletedContent',
                              action: 'manage' as const,
                          },
                      ]
                    : [],
            ),
        );
        return {
            ...deps,
            account,
            calls: {
                restore: restoreToSpace,
                permanentDelete: permanentlyDeleteFromSpace,
            },
        };
    };

    describe.each(['restore', 'permanentDelete'] as const)('%s', (method) => {
        test.each([
            ['the user who deleted it', defaultSessionUser.userUuid, false],
            ['a user who can manage deleted content', otherUserUuid, true],
        ])(
            'is allowed for %s, with the flag off',
            async (_, deletedByUserUuid, canManageDeletedContent) => {
                const { service, account, calls } = setupDeleted({
                    deletedByUserUuid,
                    canManageDeletedContent,
                });
                await service[method](account, projectUuid, 'chart-uuid');
                expect(calls[method]).toHaveBeenCalledWith(
                    'chart-uuid',
                    spaceUuid,
                    { deletedAt, deletedByUserUuid },
                );
            },
        );

        test('refuses anyone else', async () => {
            const { service, account, calls } = setupDeleted({
                deletedByUserUuid: otherUserUuid,
            });
            await expect(
                service[method](account, projectUuid, 'chart-uuid'),
            ).rejects.toThrow(ForbiddenError);
            expect(calls[method]).not.toHaveBeenCalled();
        });

        test('refuses a chart a dashboard owns', async () => {
            const { service, account, calls } = setupDeleted({
                owner: { type: 'dashboard', dashboardUuid },
                canManageDeletedContent: true,
            });
            await expect(
                service[method](account, projectUuid, 'chart-uuid'),
            ).rejects.toThrow(ParameterError);
            expect(calls[method]).not.toHaveBeenCalled();
        });

        test('misses a chart in another project', async () => {
            const { service, account, calls } = setupDeleted({
                canManageDeletedContent: true,
            });
            await expect(
                service[method](account, 'another-project', 'chart-uuid'),
            ).rejects.toThrow(NotFoundError);
            expect(calls[method]).not.toHaveBeenCalled();
        });
    });
});
