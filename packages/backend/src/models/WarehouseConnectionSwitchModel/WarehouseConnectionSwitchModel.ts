import {
    NotFoundError,
    type ProjectType,
    type WarehouseConnectionSwitchContentCounts,
    type WarehouseTypes,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { type EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import { type OrganizationWarehouseCredentialsModel } from '../OrganizationWarehouseCredentialsModel';
import {
    WarehouseConnectionModel,
    type ConnectionMode,
} from '../WarehouseConnectionModel/WarehouseConnectionModel';

const EVENTS_TABLE = 'project_connection_mode_events';

export type WarehouseConnectionSwitchProject = {
    projectUuid: string;
    projectId: number;
    organizationUuid: string;
    type: ProjectType;
    provisioningSource: string | null;
    connectionMode: ConnectionMode;
    originalWarehouseType: WarehouseTypes | null;
    originalOrganizationWarehouseCredentialsUuid: string | null;
    originalCredentialsFingerprint: string | null;
};

export type WarehouseConnectionSwitchEvent = {
    eventUuid: string;
    projectUuid: string;
    event: string;
    plan: Record<string, unknown>;
};

type WarehouseConnectionSwitchModelArguments = {
    database: Knex;
    encryptionUtil: EncryptionUtil;
    organizationWarehouseCredentialsModel: OrganizationWarehouseCredentialsModel;
};

export class WarehouseConnectionSwitchModel {
    private readonly database: Knex;

    private readonly encryptionUtil: EncryptionUtil;

    private readonly organizationWarehouseCredentialsModel: OrganizationWarehouseCredentialsModel;

    constructor(args: WarehouseConnectionSwitchModelArguments) {
        this.database = args.database;
        this.encryptionUtil = args.encryptionUtil;
        this.organizationWarehouseCredentialsModel =
            args.organizationWarehouseCredentialsModel;
    }

    async transaction<T>(
        run: (models: {
            switchModel: WarehouseConnectionSwitchModel;
            connectionModel: WarehouseConnectionModel;
        }) => Promise<T>,
    ): Promise<T> {
        return this.database.transaction((transaction) => {
            const args = {
                database: transaction,
                encryptionUtil: this.encryptionUtil,
                organizationWarehouseCredentialsModel:
                    this.organizationWarehouseCredentialsModel,
            };
            return run({
                switchModel: new WarehouseConnectionSwitchModel(args),
                connectionModel: new WarehouseConnectionModel(args),
            });
        });
    }

    async getProject(
        projectUuid: string,
    ): Promise<WarehouseConnectionSwitchProject> {
        const row = await this.database('projects')
            .innerJoin(
                'organizations',
                'organizations.organization_id',
                'projects.organization_id',
            )
            .leftJoin(
                'warehouse_credentials',
                'warehouse_credentials.project_id',
                'projects.project_id',
            )
            .select<{
                project_uuid: string;
                project_id: number;
                organization_uuid: string;
                project_type: ProjectType;
                provisioning_source: string | null;
                connection_mode: ConnectionMode;
                warehouse_type: WarehouseTypes | null;
                organization_warehouse_credentials_uuid: string | null;
                credentials_fingerprint: string | null;
            }>(
                'projects.project_uuid',
                'projects.project_id',
                'organizations.organization_uuid',
                'projects.project_type',
                'projects.provisioning_source',
                'projects.connection_mode',
                'warehouse_credentials.warehouse_type',
                'projects.organization_warehouse_credentials_uuid',
                this.database.raw(
                    'md5(warehouse_credentials.encrypted_credentials) AS credentials_fingerprint',
                ),
            )
            .where('projects.project_uuid', projectUuid)
            .first();
        if (!row) {
            throw new NotFoundError(
                `Cannot find project with id: ${projectUuid}`,
            );
        }
        return {
            projectUuid: row.project_uuid,
            projectId: row.project_id,
            organizationUuid: row.organization_uuid,
            type: row.project_type,
            provisioningSource: row.provisioning_source,
            connectionMode: row.connection_mode,
            originalWarehouseType: row.warehouse_type,
            originalOrganizationWarehouseCredentialsUuid:
                row.organization_warehouse_credentials_uuid,
            originalCredentialsFingerprint: row.credentials_fingerprint,
        };
    }

    private async count(query: Knex.QueryBuilder): Promise<number> {
        const [row] = await query.count<{ count: string }[]>({ count: '*' });
        return Number(row?.count ?? 0);
    }

    async getContentCounts(
        project: Pick<
            WarehouseConnectionSwitchProject,
            'projectUuid' | 'projectId'
        >,
    ): Promise<WarehouseConnectionSwitchContentCounts> {
        const chartsOfProject = () =>
            this.database('saved_queries')
                .leftJoin(
                    'dashboards',
                    'dashboards.dashboard_uuid',
                    'saved_queries.dashboard_uuid',
                )
                .innerJoin(
                    'spaces',
                    'spaces.space_id',
                    this.database.raw(
                        'COALESCE(saved_queries.space_id, dashboards.space_id)',
                    ),
                )
                .where('spaces.project_id', project.projectId)
                .select('saved_queries.saved_query_uuid');
        const dashboardsOfProject = () =>
            this.database('dashboards')
                .innerJoin('spaces', 'spaces.space_id', 'dashboards.space_id')
                .where('spaces.project_id', project.projectId);
        const sqlChartsOfProject = () =>
            this.database('saved_sql')
                .where('project_uuid', project.projectUuid)
                .select('saved_sql_uuid');
        const [
            explores,
            sqlCharts,
            sqlChartVersions,
            additionalDbtSources,
            scheduledDeliveries,
            dashboards,
        ] = await Promise.all([
            this.count(
                this.database('cached_explore').where(
                    'project_uuid',
                    project.projectUuid,
                ),
            ),
            this.count(
                this.database('saved_sql')
                    .where('project_uuid', project.projectUuid)
                    .whereNull('deleted_at'),
            ),
            this.count(
                this.database('saved_sql_versions').whereIn(
                    'saved_sql_uuid',
                    sqlChartsOfProject(),
                ),
            ),
            this.count(
                this.database('project_dbt_sources').where(
                    'project_uuid',
                    project.projectUuid,
                ),
            ),
            this.count(
                this.database('scheduler').where((builder) => {
                    void builder
                        .whereIn('saved_chart_uuid', chartsOfProject())
                        .orWhereIn(
                            'dashboard_uuid',
                            dashboardsOfProject().select(
                                'dashboards.dashboard_uuid',
                            ),
                        )
                        .orWhereIn('saved_sql_uuid', sqlChartsOfProject());
                }),
            ),
            this.count(dashboardsOfProject()),
        ]);
        return {
            explores,
            sqlCharts,
            sqlChartVersions,
            dbtSources: additionalDbtSources + 1,
            scheduledDeliveries,
            dashboards,
        };
    }

    async countUsersWithPersonalCredentials(
        projectUuid: string,
    ): Promise<number> {
        return this.count(
            this.database('project_user_warehouse_credentials_preference')
                .where('project_uuid', projectUuid)
                .countDistinct('user_uuid')
                .clearSelect(),
        );
    }

    async createOriginal(input: {
        projectUuid: string;
        name: string;
        listAllDatabases: boolean;
        additionalDatabases: string[];
        createdByUserUuid: string;
    }): Promise<string> {
        const [row] = await this.database('warehouse_connections')
            .insert({
                project_uuid: input.projectUuid,
                is_original: true,
                name: input.name,
                list_all_databases: input.listAllDatabases,
                additional_databases: input.additionalDatabases,
                created_by_user_uuid: input.createdByUserUuid,
            })
            .returning('warehouse_connection_uuid');
        return row.warehouse_connection_uuid;
    }

    async setMultiMode(projectUuid: string): Promise<void> {
        await this.database('projects')
            .where('project_uuid', projectUuid)
            .update({ connection_mode: 'multi' } as never);
    }

    async insertSwitchEvent(input: {
        projectUuid: string;
        actorUserUuid: string;
        plan: Record<string, unknown>;
        planHash: string;
        idempotencyKey: string;
    }): Promise<string> {
        const [row] = await this.database(EVENTS_TABLE)
            .insert({
                project_uuid: input.projectUuid,
                actor_user_uuid: input.actorUserUuid,
                event: 'switched_to_multi',
                plan: JSON.stringify(input.plan),
                plan_hash: input.planHash,
                idempotency_key: input.idempotencyKey,
            })
            .returning('project_connection_mode_event_uuid');
        return row.project_connection_mode_event_uuid;
    }

    async findEventByIdempotencyKey(
        idempotencyKey: string,
    ): Promise<WarehouseConnectionSwitchEvent | undefined> {
        const row = await this.database(EVENTS_TABLE)
            .select<
                {
                    project_connection_mode_event_uuid: string;
                    project_uuid: string;
                    event: string;
                    plan: Record<string, unknown>;
                }[]
            >(
                'project_connection_mode_event_uuid',
                'project_uuid',
                'event',
                'plan',
            )
            .where('idempotency_key', idempotencyKey)
            .first();
        return row
            ? {
                  eventUuid: row.project_connection_mode_event_uuid,
                  projectUuid: row.project_uuid,
                  event: row.event,
                  plan: row.plan,
              }
            : undefined;
    }
}
