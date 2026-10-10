import {
    AgentActorSurface,
    ChartKind,
    ChartType,
    DefaultSupportedDbtVersion,
    ProjectType,
    type AllVizChartConfig,
    type CreateSavedChart,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { fromSession } from '../../../auth/account';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import * as auditLogger from '../../../logging/winston';
import { AgentActionLogModel } from '../../../models/AgentActionLogModel';
import { AppModel } from '../../../models/AppModel';
import { DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import { DocumentModel } from '../../../models/DocumentModel';
import { SavedChartModel } from '../../../models/SavedChartModel';
import { SavedSqlModel } from '../../../models/SavedSqlModel';
import {
    agentExecutionContext,
    createAgentExecutionContext,
    getContentWriteAgentIdentity,
} from '../../../services/AiAccessService/agentExecutionContext';
import {
    logAgentContentWrite,
    recordAgentAction,
} from '../../../services/AiAccessService/logAgentContentWrite';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { down, up } from '../20261010230000_add_content_version_agent_identity';

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
        migrated = await createMigratedDatabase();
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
            const chartModel = new SavedChartModel({
                database,
                lightdashConfig: lightdashConfigMock,
            });
            const dashboardModel = new DashboardModel({ database });
            const sqlModel = new SavedSqlModel({
                database,
                lightdashConfig: lightdashConfigMock,
            });
            const appModel = new AppModel({ database });
            const documentModel = new DocumentModel({ database });
            const ledger = new AgentActionLogModel({ database });
            const log = vi
                .spyOn(auditLogger, 'logAuditEvent')
                .mockImplementation(() => {});
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
                const chart = await chartModel.create(
                    projectUuid,
                    userUuid,
                    chartData,
                    claim,
                );
                await chartModel.createVersion(
                    chart.uuid,
                    chartData,
                    user,
                    undefined,
                    undefined,
                    claim,
                );
                const dashboard = await dashboardModel.create(
                    spaceUuid,
                    {
                        name: 'Dashboard',
                        slug: 'dashboard',
                        tiles: [],
                        tabs: [],
                    },
                    user,
                    projectUuid,
                    claim,
                );
                await dashboardModel.addVersion(
                    dashboard.uuid,
                    dashboard,
                    user,
                    projectUuid,
                    undefined,
                    claim,
                );
                const config: AllVizChartConfig = {
                    type: ChartKind.TABLE,
                    columns: {},
                    display: undefined,
                    metadata: { version: 1 },
                };
                const sql = await sqlModel.create(
                    userUuid,
                    projectUuid,
                    {
                        name: 'SQL',
                        description: '',
                        sql: 'select 1',
                        limit: 1,
                        spaceUuid,
                        config,
                    },
                    undefined,
                    { slugMode: 'exact' },
                    claim,
                );
                await sqlModel.update(
                    {
                        userUuid,
                        savedSqlUuid: sql.savedSqlUuid,
                        sqlChart: {
                            versionedData: {
                                sql: 'select 2',
                                limit: 1,
                                config,
                            },
                        },
                    },
                    undefined,
                    claim,
                );
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
                const objects = [
                    { objectType: 'chart', objectUuid: chart.uuid },
                    { objectType: 'dashboard', objectUuid: dashboard.uuid },
                    { objectType: 'sql_chart', objectUuid: sql.savedSqlUuid },
                    { objectType: 'data_app', objectUuid: app.app.app_id },
                    { objectType: 'document', objectUuid: doc.documentUuid },
                ];
                await Promise.all(
                    objects.map(async (object) => {
                        await logAgentContentWrite({
                            model: ledger,
                            agentIdentity: claim,
                            projectUuid,
                            ...object,
                            versionUuid: null,
                            action: 'create',
                        });
                        await logAgentContentWrite({
                            model: ledger,
                            agentIdentity: claim,
                            projectUuid,
                            ...object,
                            versionUuid: null,
                            action: 'update',
                        });
                    }),
                );
                const actions = await database('agent_action_log').where(
                    'organization_uuid',
                    organizationUuid,
                );
                expect(actions).toHaveLength(claim ? 10 : 0);
                expect(log).toHaveBeenCalledTimes(claim ? 10 : 0);
                if (claim) {
                    expect(actions).toEqual(
                        expect.arrayContaining(
                            objects.flatMap((object) =>
                                ['create', 'update'].map((action) =>
                                    expect.objectContaining({
                                        agent_identity: claim,
                                        object_type: object.objectType,
                                        object_uuid: object.objectUuid,
                                        action,
                                        outcome: 'allowed',
                                        policy_layer: null,
                                        reason_code: null,
                                    }),
                                ),
                            ),
                        ),
                    );
                }
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
    test('ledger insertion uses the domain transaction and rolls back together', async () => {
        const ledger = new AgentActionLogModel({ database });
        const organizationUuid = randomUUID();
        const scope = createAgentExecutionContext({
            account: fromSession({ ...defaultSessionUser, organizationUuid }),
            surface: AgentActorSurface.MCP,
            clientId: null,
            agentUuid: null,
            agentIdentityEnabled: true,
        });
        const log = vi
            .spyOn(auditLogger, 'logAuditEvent')
            .mockImplementation(() => {});
        await expect(
            agentExecutionContext.run(scope, () =>
                database.transaction(async (trx) => {
                    await trx<{
                        organization_uuid: string;
                        organization_name: string;
                    }>('organizations').insert({
                        organization_uuid: organizationUuid,
                        organization_name: 'transactional agent action',
                    });
                    await logAgentContentWrite({
                        model: ledger,
                        trx,
                        agentIdentity: scope.claim,
                        projectUuid: null,
                        objectType: 'space',
                        objectUuid: randomUUID(),
                        versionUuid: null,
                        action: 'create',
                    });
                    expect(
                        await trx('agent_action_log').where(
                            'organization_uuid',
                            organizationUuid,
                        ),
                    ).toHaveLength(1);
                    expect(log).not.toHaveBeenCalled();
                    throw new Error('domain rollback');
                }),
            ),
        ).rejects.toThrow('domain rollback');
        expect(
            await database('organizations').where(
                'organization_uuid',
                organizationUuid,
            ),
        ).toEqual([]);
        expect(
            await database('agent_action_log').where(
                'organization_uuid',
                organizationUuid,
            ),
        ).toEqual([]);
        expect(log).not.toHaveBeenCalled();
        await expect(
            agentExecutionContext.run(scope, () =>
                database.transaction(async (trx) => {
                    await trx<{
                        organization_uuid: string;
                        organization_name: string;
                    }>('organizations').insert({
                        organization_uuid: organizationUuid,
                        organization_name: 'failed ledger',
                    });
                    await logAgentContentWrite({
                        model: ledger,
                        trx,
                        agentIdentity: scope.claim,
                        projectUuid: null,
                        objectType: 'space',
                        objectUuid: 'invalid-uuid',
                        versionUuid: null,
                        action: 'create',
                    });
                }),
            ),
        ).rejects.toThrow();
        expect(
            await database('organizations').where(
                'organization_uuid',
                organizationUuid,
            ),
        ).toEqual([]);
        expect(log).not.toHaveBeenCalled();
    });
    test('committed transactions emit the audit only after commit', async () => {
        const ledger = new AgentActionLogModel({ database });
        const [{ organization_uuid: organizationUuid }] = await database(
            'organizations',
        )
            .insert({ organization_name: 'committed action' })
            .returning('organization_uuid');
        const scope = createAgentExecutionContext({
            account: fromSession({ ...defaultSessionUser, organizationUuid }),
            surface: AgentActorSurface.MCP,
            clientId: null,
            agentUuid: null,
            agentIdentityEnabled: true,
        });
        const log = vi
            .spyOn(auditLogger, 'logAuditEvent')
            .mockImplementation(() => {});
        await agentExecutionContext.run(scope, () =>
            database.transaction(async (trx) => {
                await logAgentContentWrite({
                    model: ledger,
                    trx,
                    agentIdentity: scope.claim,
                    projectUuid: null,
                    objectType: 'space',
                    objectUuid: randomUUID(),
                    versionUuid: null,
                    action: 'create',
                });
                expect(log).not.toHaveBeenCalled();
            }),
        );
        expect(log).toHaveBeenCalledOnce();
        expect(
            await database('agent_action_log').where(
                'organization_uuid',
                organizationUuid,
            ),
        ).toHaveLength(1);
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
