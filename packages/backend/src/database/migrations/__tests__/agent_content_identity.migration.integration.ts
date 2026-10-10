import {
    AgentActorSurface,
    ChartKind,
    ChartType,
    DefaultSupportedDbtVersion,
    ProjectType,
    PromotionAction,
    type AllVizChartConfig,
    type CreateSavedChart,
    type PromotionChanges,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { fromSession } from '../../../auth/account';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import * as auditLogger from '../../../logging/winston';
import { AgentActionLogModel } from '../../../models/AgentActionLogModel';
import { AppModel } from '../../../models/AppModel';
import { ContentVerificationModel } from '../../../models/ContentVerificationModel';
import { storedVersionAgentIdentity } from '../../../models/ContentVersionIdentity';
import { DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import { DocumentModel } from '../../../models/DocumentModel';
import { SavedChartModel } from '../../../models/SavedChartModel';
import { SavedSqlModel } from '../../../models/SavedSqlModel';
import {
    agentExecutionContext,
    createAgentExecutionContext,
    getContentWriteAgentIdentity,
} from '../../../services/AiAccessService/agentExecutionContext';
import { recordAgentAction } from '../../../services/AiAccessService/logAgentContentWrite';
import { PromoteService } from '../../../services/PromoteService/PromoteService';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { down, up } from '../20261010230000_add_content_version_agent_identity';

vi.mock('../../../config/lightdashConfig', async () => ({
    lightdashConfig: (await import('../../../config/lightdashConfig.mock'))
        .lightdashConfigMock,
}));

const tables = [
    'saved_queries_versions',
    'dashboard_versions',
    'saved_sql_versions',
    'app_versions',
    'document_versions',
];

describe('content version agent identity migration', () => {
    let migrated: MigratedDatabase;
    let database: Knex;
    beforeAll(async () => {
        migrated = await createMigratedDatabase(undefined, {
            min: 0,
            max: 1,
            acquireTimeoutMillis: 1500,
        });
        database = migrated.database;
    });
    afterAll(async () => {
        await migrated?.destroy();
    });
    afterEach(() => vi.restoreAllMocks());
    test('creates the ledger shape, defaults, and all lookup indexes', async () => {
        const columns = await database('information_schema.columns')
            .where({ table_schema: 'public', table_name: 'agent_action_log' })
            .select(
                'column_name',
                'data_type',
                'is_nullable',
                'column_default',
            );
        expect(columns.map((column) => column.column_name).sort()).toEqual(
            [
                'agent_action_log_uuid',
                'organization_uuid',
                'project_uuid',
                'occurred_at',
                'agent_identity',
                'object_type',
                'object_uuid',
                'object_id',
                'version_uuid',
                'action',
                'outcome',
                'policy_layer',
                'reason_code',
            ].sort(),
        );
        expect(
            columns.find((column) => column.column_name === 'agent_identity'),
        ).toMatchObject({
            data_type: 'jsonb',
            is_nullable: 'NO',
            column_default: null,
        });
        expect(
            columns.find((column) => column.column_name === 'occurred_at'),
        ).toMatchObject({
            data_type: 'timestamp with time zone',
            is_nullable: 'NO',
            column_default: 'CURRENT_TIMESTAMP',
        });
        const indexes = await database('pg_indexes')
            .where({ schemaname: 'public', tablename: 'agent_action_log' })
            .select('indexname', 'indexdef');
        expect(indexes.map((index) => index.indexname)).toEqual(
            expect.arrayContaining([
                'agent_action_log_pkey',
                'agent_action_log_org_time_idx',
                'agent_action_log_org_client_idx',
                'agent_action_log_org_agent_idx',
                'agent_action_log_org_subject_idx',
                'agent_action_log_retention_idx',
            ]),
        );
        expect(
            indexes.find(
                (index) => index.indexname === 'agent_action_log_org_time_idx',
            )?.indexdef,
        ).toContain('(organization_uuid, occurred_at DESC)');
        for (const [name, field] of [
            ['client', 'client_id'],
            ['agent', 'agent_uuid'],
            ['subject', 'uuid'],
        ]) {
            expect(
                indexes.find(
                    (index) =>
                        index.indexname === `agent_action_log_org_${name}_idx`,
                )?.indexdef,
            ).toContain(`->> '${field}'`);
        }
    });
    test.each(tables)(
        '%s adds only a nullable JSONB field without a default',
        async (tableName) => {
            const column = await database('information_schema.columns')
                .where({
                    table_schema: 'public',
                    table_name: tableName,
                    column_name: 'agent_identity',
                })
                .first('data_type', 'is_nullable', 'column_default');
            expect(column).toEqual({
                data_type: 'jsonb',
                is_nullable: 'YES',
                column_default: null,
            });
        },
    );
    test.each([
        [AgentActorSurface.MCP, true],
        [AgentActorSurface.IN_APP_AGENT, true],
        [AgentActorSurface.SLACK_AGENT, true],
        [AgentActorSurface.IN_APP_AGENT, false],
        [null, true],
    ] as const)(
        '%s enabled=%s persists explicit claims on all five version types',
        async (surface, enabled) => {
            const [
                {
                    organization_id: organizationId,
                    organization_uuid: organizationUuid,
                },
            ] = await database('organizations')
                .insert({ organization_name: `agent identity ${randomUUID()}` })
                .returning(['organization_id', 'organization_uuid']);
            const [{ user_uuid: userUuid }] = await database('users')
                .insert({
                    first_name: 'Agent',
                    last_name: 'Writer',
                    is_active: true,
                    is_marketing_opted_in: false,
                    is_setup_complete: true,
                    is_tracking_anonymized: false,
                })
                .returning('user_uuid');
            const [{ project_id: projectId, project_uuid: projectUuid }] =
                await database('projects')
                    .insert({
                        name: 'identity',
                        organization_id: organizationId,
                        project_type: ProjectType.DEFAULT,
                        dbt_connection: null,
                        dbt_connection_type: null,
                        copied_from_project_uuid: null,
                        dbt_version: DefaultSupportedDbtVersion,
                        created_by_user_uuid: userUuid,
                        organization_warehouse_credentials_uuid: null,
                    })
                    .returning(['project_id', 'project_uuid']);
            const [{ space_uuid: spaceUuid }] = await database('spaces')
                .insert({
                    name: 'Reports',
                    slug: 'reports',
                    path: 'reports',
                    project_id: projectId,
                    parent_space_uuid: null,
                    inherit_parent_permissions: true,
                    is_default_user_space: false,
                })
                .returning('space_uuid');
            const user = { ...defaultSessionUser, userUuid, organizationUuid };
            const scope = createAgentExecutionContext({
                account: fromSession(user),
                surface: surface ?? AgentActorSurface.IN_APP_AGENT,
                clientId: 'trusted-client',
                agentUuid: randomUUID(),
                agentIdentityEnabled: enabled,
            });
            const contentVerificationModel = new ContentVerificationModel({
                database,
            });
            const chartModel = new SavedChartModel({
                database,
                contentVerificationModel,
                lightdashConfig: lightdashConfigMock,
            });
            const dashboardModel = new DashboardModel({
                database,
                contentVerificationModel,
            });
            const sqlModel = new SavedSqlModel({
                database,
                lightdashConfig: lightdashConfigMock,
            });
            const appModel = new AppModel({ database });
            const documentModel = new DocumentModel({ database });
            const ledger = new AgentActionLogModel({ database });
            const service = new PromoteService({
                lightdashConfig: lightdashConfigMock,
                savedChartModel: chartModel,
                dashboardModel,
                savedSqlModel: sqlModel,
                agentActionLogModel: ledger,
            } as unknown as ConstructorParameters<typeof PromoteService>[0]);
            const run = async () => {
                const claim = getContentWriteAgentIdentity({
                    userUuid: user.userUuid,
                    organizationUuid: user.organizationUuid,
                });
                expect(claim).toEqual(surface && enabled ? scope.claim : null);
                const chartData: CreateSavedChart & {
                    updatedByUser: typeof user;
                    slug: string;
                } = {
                    name: 'Chart',
                    slug: 'chart',
                    tableName: 'orders',
                    spaceUuid,
                    dashboardUuid: null,
                    metricQuery: {
                        exploreName: 'orders',
                        dimensions: [],
                        metrics: [],
                        filters: {},
                        sorts: [],
                        limit: 10,
                        tableCalculations: [],
                    },
                    chartConfig: { type: ChartType.TABLE },
                    tableConfig: { columnOrder: [] },
                    updatedByUser: user,
                };
                const createChanges: PromotionChanges = {
                    charts: [
                        {
                            action: PromotionAction.CREATE,
                            data: {
                                ...chartData,
                                uuid: randomUUID(),
                                oldUuid: randomUUID(),
                                projectUuid,
                                organizationUuid,
                                spaceSlug: 'reports',
                                spacePath: 'reports',
                            } as unknown as PromotionChanges['charts'][0]['data'],
                        },
                    ],
                    dashboards: [],
                    spaces: [],
                };
                const createdChanges = await service.upsertCharts(
                    user,
                    createChanges,
                );
                const chart = createdChanges.charts[0].data;
                const updateChanges: PromotionChanges = {
                    ...createdChanges,
                    charts: [
                        {
                            action: PromotionAction.UPDATE,
                            data: { ...chart, name: 'Updated chart' },
                        },
                    ],
                };
                await service.upsertCharts(user, updateChanges);
                const actions = await database('agent_action_log').where({
                    object_uuid: chart.uuid,
                });
                expect(actions).toHaveLength(claim ? 2 : 0);
                if (claim) {
                    const versions = await chartModel.getLatestVersionSummaries(
                        chart.uuid,
                    );
                    expect(actions).toEqual(
                        expect.arrayContaining(
                            versions.map(({ versionUuid }) =>
                                expect.objectContaining({
                                    version_uuid: versionUuid,
                                    agent_identity: claim,
                                    object_type: 'chart',
                                    outcome: 'allowed',
                                }),
                            ),
                        ),
                    );
                    const failLedger = vi
                        .spyOn(ledger, 'insert')
                        .mockRejectedValueOnce(new Error('ledger unavailable'));
                    await expect(
                        service.upsertCharts(user, {
                            ...updateChanges,
                            charts: [
                                {
                                    action: PromotionAction.UPDATE,
                                    data: {
                                        ...chart,
                                        slug: 'failed-slug',
                                        name: 'Must roll back',
                                    },
                                },
                            ],
                        }),
                    ).rejects.toThrow('ledger unavailable');
                    failLedger.mockRestore();
                    expect(await chartModel.get(chart.uuid)).toMatchObject({
                        name: 'Updated chart',
                        slug: 'chart',
                    });
                    expect(
                        await chartModel.getLatestVersionSummaries(chart.uuid),
                    ).toHaveLength(2);
                    expect(
                        await database('agent_action_log').where({
                            object_uuid: chart.uuid,
                        }),
                    ).toHaveLength(2);
                    const failCreateLedger = vi
                        .spyOn(ledger, 'insert')
                        .mockRejectedValueOnce(new Error('ledger unavailable'));
                    await expect(
                        service.upsertCharts(user, {
                            ...createChanges,
                            charts: [
                                {
                                    ...createChanges.charts[0],
                                    data: {
                                        ...createChanges.charts[0].data,
                                        slug: 'failed-create',
                                    },
                                },
                            ],
                        }),
                    ).rejects.toThrow('ledger unavailable');
                    failCreateLedger.mockRestore();
                    expect(
                        await database('saved_queries').where({
                            project_uuid: projectUuid,
                            slug: 'failed-create',
                        }),
                    ).toHaveLength(0);
                }
                const dashboardCreated = await service.getOrCreateDashboard(
                    user,
                    {
                        charts: [],
                        spaces: [],
                        dashboards: [
                            {
                                action: PromotionAction.CREATE,
                                data: {
                                    name: 'Dashboard',
                                    slug: 'dashboard',
                                    tiles: [],
                                    tabs: [],
                                    spaceUuid,
                                    projectUuid,
                                    spaceSlug: 'reports',
                                    spacePath: 'reports',
                                } as unknown as PromotionChanges['dashboards'][0]['data'],
                            },
                        ],
                    },
                );
                const dashboard = dashboardCreated.dashboards[0].data;
                expect(
                    await database('agent_action_log').where({
                        object_uuid: dashboard.uuid,
                    }),
                ).toHaveLength(claim ? 1 : 0);
                await service.updateDashboard(user, {
                    ...dashboardCreated,
                    dashboards: [
                        {
                            action: PromotionAction.UPDATE,
                            data: { ...dashboard, name: 'Updated dashboard' },
                        },
                    ],
                });
                const dashboardVersions = await database('dashboard_versions')
                    .join(
                        'dashboards',
                        'dashboards.dashboard_id',
                        'dashboard_versions.dashboard_id',
                    )
                    .where({ dashboard_uuid: dashboard.uuid })
                    .select('dashboard_versions.*');
                expect(dashboardVersions).toHaveLength(2);
                expect(
                    dashboardVersions.map((version) => version.agent_identity),
                ).toEqual([claim, claim]);
                expect(
                    await database('agent_action_log').where({
                        object_uuid: dashboard.uuid,
                    }),
                ).toHaveLength(claim ? 2 : 0);
                if (claim) {
                    const [{ space_uuid: destinationSpaceUuid }] =
                        await database('spaces')
                            .insert({
                                name: 'Destination',
                                slug: 'destination',
                                path: 'destination',
                                project_id: projectId,
                                parent_space_uuid: null,
                                inherit_parent_permissions: true,
                                is_default_user_space: false,
                            })
                            .returning('space_uuid');
                    const dashboardChanges: PromotionChanges = {
                        charts: [],
                        spaces: [],
                        dashboards: [
                            {
                                action: PromotionAction.UPDATE,
                                data: {
                                    ...dashboard,
                                    slug: 'new-dashboard-slug',
                                    name: 'Must roll back',
                                    description: 'Changed description',
                                    spaceUuid: destinationSpaceUuid,
                                    spaceSlug: 'reports',
                                    spacePath: 'reports',
                                    owner: {
                                        userUuid,
                                        firstName: 'Agent',
                                        lastName: 'Writer',
                                        email: 'unused@example.com',
                                    },
                                },
                            },
                        ],
                    };
                    const failLedger = vi
                        .spyOn(ledger, 'insert')
                        .mockRejectedValueOnce(new Error('ledger unavailable'));
                    await expect(
                        service.updateDashboard(user, dashboardChanges),
                    ).rejects.toThrow('ledger unavailable');
                    failLedger.mockRestore();
                    expect(
                        await dashboardModel.getByIdOrSlug(dashboard.uuid),
                    ).toMatchObject({
                        name: 'Updated dashboard',
                        slug: 'dashboard',
                        description: dashboard.description,
                        spaceUuid,
                        owner: null,
                    });
                    expect(
                        await database('agent_action_log').where({
                            object_uuid: dashboard.uuid,
                        }),
                    ).toHaveLength(2);
                    expect(
                        await database('dashboard_versions').whereIn(
                            'dashboard_version_uuid',
                            dashboardVersions.map(
                                (version) => version.dashboard_version_uuid,
                            ),
                        ),
                    ).toEqual(expect.arrayContaining(dashboardVersions));
                    expect(
                        await database('dashboard_versions').where(
                            'dashboard_id',
                            dashboardVersions[0].dashboard_id,
                        ),
                    ).toHaveLength(2);
                }
                const config: AllVizChartConfig = {
                    type: ChartKind.TABLE,
                    columns: {},
                    display: undefined,
                    metadata: { version: 1 },
                };
                const sqlChanges: PromotionChanges = {
                    charts: [],
                    dashboards: [],
                    spaces: [
                        {
                            action: PromotionAction.NO_CHANGES,
                            data: {
                                uuid: spaceUuid,
                                path: 'reports',
                            } as PromotionChanges['spaces'][0]['data'],
                        },
                    ],
                };
                const sqlData = {
                    uuid: randomUUID(),
                    oldUuid: randomUUID(),
                    slug: 'sql',
                    projectUuid,
                    spaceSlug: 'reports',
                    spacePath: 'reports',
                    unversionedData: {
                        name: 'SQL',
                        description: '',
                        spaceUuid,
                    },
                    versionedData: { sql: 'select 1', limit: 1, config },
                };
                await service.upsertSqlCharts(user, sqlChanges, [
                    { action: PromotionAction.CREATE, data: sqlData },
                ]);
                const [sqlRow] = await database('saved_sql').where({
                    project_uuid: projectUuid,
                    slug: 'sql',
                });
                const sql = { savedSqlUuid: sqlRow.saved_sql_uuid };
                const sqlUpdate = {
                    ...sqlData,
                    uuid: sql.savedSqlUuid,
                    versionedData: {
                        ...sqlData.versionedData,
                        sql: 'select 2',
                    },
                };
                await service.upsertSqlCharts(user, sqlChanges, [
                    { action: PromotionAction.UPDATE, data: sqlUpdate },
                ]);
                const sqlActions = await database('agent_action_log').where({
                    object_uuid: sql.savedSqlUuid,
                });
                expect(sqlActions).toHaveLength(claim ? 2 : 0);
                if (claim) {
                    const versions = await database('saved_sql_versions').where(
                        { saved_sql_uuid: sql.savedSqlUuid },
                    );
                    expect(sqlActions).toEqual(
                        expect.arrayContaining(
                            versions.map((version) =>
                                expect.objectContaining({
                                    version_uuid:
                                        version.saved_sql_version_uuid,
                                    agent_identity: claim,
                                    object_type: 'sql_chart',
                                    outcome: 'allowed',
                                }),
                            ),
                        ),
                    );
                    const failure = vi
                        .spyOn(ledger, 'insert')
                        .mockRejectedValueOnce(new Error('ledger unavailable'));
                    await expect(
                        service.upsertSqlCharts(user, sqlChanges, [
                            {
                                action: PromotionAction.UPDATE,
                                data: {
                                    ...sqlUpdate,
                                    unversionedData: {
                                        ...sqlData.unversionedData,
                                        name: 'Must roll back',
                                    },
                                },
                            },
                        ]),
                    ).rejects.toThrow('ledger unavailable');
                    failure.mockRestore();
                    expect(
                        await database('saved_sql_versions').where({
                            saved_sql_uuid: sql.savedSqlUuid,
                        }),
                    ).toHaveLength(2);
                    expect(
                        await sqlModel.getByUuid(sql.savedSqlUuid),
                    ).toMatchObject({ name: 'SQL', sql: 'select 2' });
                    const createFailure = vi
                        .spyOn(ledger, 'insert')
                        .mockRejectedValueOnce(new Error('ledger unavailable'));
                    await expect(
                        service.upsertSqlCharts(user, sqlChanges, [
                            {
                                action: PromotionAction.CREATE,
                                data: {
                                    ...sqlData,
                                    slug: 'failed-sql',
                                },
                            },
                        ]),
                    ).rejects.toThrow('ledger unavailable');
                    createFailure.mockRestore();
                    expect(
                        await database('saved_sql').where({
                            project_uuid: projectUuid,
                            slug: 'failed-sql',
                        }),
                    ).toHaveLength(0);
                }
                expect(
                    (
                        await sqlModel.getByUuid(sql.savedSqlUuid, {
                            projectUuid,
                        })
                    )[storedVersionAgentIdentity],
                ).toEqual(claim);
                const app = await appModel.createWithVersion(
                    {
                        project_uuid: projectUuid,
                        created_by_user_uuid: userUuid,
                        name: 'App',
                    },
                    { version: 1, prompt: 'create' },
                    'pending',
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    claim,
                );
                await appModel.createVersion(
                    app.app.app_id,
                    { version: 2, prompt: 'update' },
                    'pending',
                    userUuid,
                    undefined,
                    undefined,
                    undefined,
                    undefined,
                    claim,
                );
                const content = { markdown: '# Report', charts: {} };
                const doc = await documentModel.create(
                    {
                        projectUuid,
                        spaceUuid,
                        name: 'Document',
                        description: '',
                        content,
                        createdByUserUuid: userUuid,
                    },
                    claim,
                );
                await documentModel.updateContent(
                    projectUuid,
                    doc.documentUuid,
                    {
                        baseVersionUuid: doc.version.versionUuid,
                        expectedSpaceUuid: spaceUuid,
                        content,
                    },
                    userUuid,
                    claim,
                );
                const chartRows = await database('saved_queries_versions')
                    .join(
                        'saved_queries',
                        'saved_queries.saved_query_id',
                        'saved_queries_versions.saved_query_id',
                    )
                    .where('saved_query_uuid', chart.uuid)
                    .select('agent_identity');
                const dashboardRows = await database('dashboard_versions')
                    .join(
                        'dashboards',
                        'dashboards.dashboard_id',
                        'dashboard_versions.dashboard_id',
                    )
                    .where('dashboard_uuid', dashboard.uuid)
                    .select('agent_identity');
                const sqlRows = await database('saved_sql_versions')
                    .where('saved_sql_uuid', sql.savedSqlUuid)
                    .select('agent_identity');
                const appRows = await database('app_versions')
                    .where('app_id', app.app.app_id)
                    .select('agent_identity');
                const docRows = await database('document_versions')
                    .join(
                        'documents',
                        'documents.document_id',
                        'document_versions.document_id',
                    )
                    .where('document_uuid', doc.documentUuid)
                    .select('agent_identity');
                for (const rows of [
                    chartRows,
                    dashboardRows,
                    sqlRows,
                    appRows,
                    docRows,
                ])
                    expect(rows).toEqual([
                        { agent_identity: claim },
                        { agent_identity: claim },
                    ]);
                await appModel.updateVersionStatusIfInProgress(
                    app.app.app_id,
                    2,
                    'ready',
                );
                const terminal = await database('app_versions')
                    .where({ app_id: app.app.app_id, version: 2 })
                    .first('agent_identity');
                expect(terminal?.agent_identity).toEqual(claim);
            };
            if (surface) await agentExecutionContext.run(scope, run);
            else await run();
        },
    );
    test('ledger supports denials, permits absent content references, bounds retention, and cascades organization deletion', async () => {
        const [{ organization_uuid: organizationUuid }] = await database(
            'organizations',
        )
            .insert({ organization_name: 'ledger lifecycle' })
            .returning('organization_uuid');
        const scope = createAgentExecutionContext({
            account: fromSession({ ...defaultSessionUser, organizationUuid }),
            surface: AgentActorSurface.IN_APP_AGENT,
            clientId: 'lightdash-chat',
            agentUuid: randomUUID(),
            agentIdentityEnabled: true,
        });
        const ledger = new AgentActionLogModel({ database });
        const log = vi
            .spyOn(auditLogger, 'logAuditEvent')
            .mockImplementation(() => {});
        await agentExecutionContext.run(scope, () =>
            recordAgentAction({
                model: ledger,
                agentIdentity: scope.claim,
                projectUuid: randomUUID(),
                objectType: 'share',
                objectUuid: null,
                objectId: 'safe-nanoid',
                versionUuid: null,
                action: 'create',
                outcome: 'denied',
                policyLayer: 'casl',
                reasonCode: 'share_create_forbidden',
            }),
        );
        const row = await database('agent_action_log')
            .where('organization_uuid', organizationUuid)
            .first();
        expect(row).toMatchObject({
            outcome: 'denied',
            policy_layer: 'casl',
            reason_code: 'share_create_forbidden',
            object_id: 'safe-nanoid',
        });
        expect(row?.agent_action_log_uuid).toEqual(expect.any(String));
        expect(row?.occurred_at).toBeInstanceOf(Date);
        expect(log).toHaveBeenCalledOnce();
        await expect(
            database('agent_action_log').insert({
                organization_uuid: organizationUuid,
                agent_identity: scope.claim!,
                project_uuid: null,
                object_uuid: null,
                object_id: null,
                version_uuid: null,
                policy_layer: null,
                reason_code: null,
                object_type: 'chart',
                action: 'create',
                outcome: 'invalid' as 'allowed',
            }),
        ).rejects.toThrow(/agent_action_log_outcome_check/);
        const foreignKeys = await database(
            'information_schema.table_constraints as constraints',
        )
            .join(
                'information_schema.referential_constraints as refs',
                'refs.constraint_name',
                'constraints.constraint_name',
            )
            .where({
                'constraints.table_name': 'agent_action_log',
                'constraints.constraint_type': 'FOREIGN KEY',
            })
            .select('refs.delete_rule');
        expect(foreignKeys).toEqual([{ delete_rule: 'CASCADE' }]);
        await database('agent_action_log').insert(
            Array.from({ length: 3 }, () => ({
                organization_uuid: organizationUuid,
                agent_identity: scope.claim!,
                project_uuid: null,
                object_id: null,
                policy_layer: null,
                reason_code: null,
                object_type: 'deleted_chart',
                object_uuid: randomUUID(),
                version_uuid: randomUUID(),
                action: 'create',
                outcome: 'allowed' as const,
                occurred_at: new Date('2000-01-01'),
            })),
        );
        expect(
            await ledger.cleanupBatch(new Date('2001-01-01'), 2, 0, 1),
        ).toEqual({ totalDeleted: 2, batchCount: 1 });
        expect(
            await ledger.cleanupBatch(new Date('2001-01-01'), 2, 0, undefined),
        ).toEqual({ totalDeleted: 1, batchCount: 1 });
        expect(
            await database('agent_action_log').where(
                'organization_uuid',
                organizationUuid,
            ),
        ).toHaveLength(1);
        await database('organizations')
            .where('organization_uuid', organizationUuid)
            .delete();
        expect(
            await database('agent_action_log').where(
                'organization_uuid',
                organizationUuid,
            ),
        ).toEqual([]);
    });
    test('down removes all five columns and up restores them', async () => {
        await database.transaction(async (trx) => {
            await down(trx);
            expect(await trx.schema.hasTable('agent_action_log')).toBe(false);
            expect(
                await Promise.all(
                    tables.map((table) =>
                        trx.schema.hasColumn(table, 'agent_identity'),
                    ),
                ),
            ).toEqual(tables.map(() => false));
            await up(trx);
            expect(await trx.schema.hasTable('agent_action_log')).toBe(true);
            expect(
                await Promise.all(
                    tables.map((table) =>
                        trx.schema.hasColumn(table, 'agent_identity'),
                    ),
                ),
            ).toEqual(tables.map(() => true));
        });
    });
});
