import {
    normalizeWarehouseCredentials,
    NotFoundError,
    ParameterError,
    UnexpectedServerError,
    type CreateWarehouseCredentials,
    type WarehouseConnection,
    type WarehouseTypes,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { type EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import { type OrganizationWarehouseCredentialsModel } from '../OrganizationWarehouseCredentialsModel';

const WAREHOUSE_CONNECTIONS_TABLE = 'warehouse_connections';
const EVENTS_TABLE = 'project_connection_mode_events';
const IN_FLIGHT_QUERY_STATUSES = ['pending', 'queued', 'executing'];

type DbWarehouseConnection = {
    warehouse_connection_uuid: string;
    project_uuid: string;
    is_original: boolean;
    name: string;
    warehouse_type: string | null;
    encrypted_credentials: Buffer | null;
    organization_warehouse_credentials_uuid: string | null;
    list_all_databases: boolean;
    additional_databases: string[];
    created_by_user_uuid: string | null;
    created_at: Date;
    updated_at: Date;
};

export type ConnectionMode = 'single' | 'multi';

export type WarehouseConnectionProject = {
    projectUuid: string;
    organizationUuid: string;
    connectionMode: ConnectionMode;
    originalWarehouseType: WarehouseTypes | null;
};

export type WarehouseConnectionBoundContent = {
    explores: string[];
    dbtSources: string[];
    sqlCharts: string[];
    inFlightQueries: number;
};

export type WarehouseConnectionCredentialSource =
    | { kind: 'project'; credentials: CreateWarehouseCredentials }
    | { kind: 'organization'; organizationWarehouseCredentialsUuid: string };

export type CreateExtraWarehouseConnection = {
    name: string;
    warehouseType: WarehouseTypes;
    source: WarehouseConnectionCredentialSource;
    listAllDatabases: boolean;
    additionalDatabases: string[];
    createdByUserUuid: string;
};

export type WarehouseConnectionListingSettings = {
    listAllDatabases: boolean;
    additionalDatabases: string[];
};

export type WarehouseConnectionEvent = {
    projectUuid: string;
    actorUserUuid: string;
    event: 'connection_added' | 'connection_removed';
    plan: Record<string, unknown>;
};

type WarehouseConnectionModelArguments = {
    database: Knex;
    encryptionUtil: EncryptionUtil;
    organizationWarehouseCredentialsModel: OrganizationWarehouseCredentialsModel;
};

export class WarehouseConnectionModel {
    private readonly database: Knex;

    private readonly encryptionUtil: EncryptionUtil;

    private readonly organizationWarehouseCredentialsModel: OrganizationWarehouseCredentialsModel;

    constructor(args: WarehouseConnectionModelArguments) {
        this.database = args.database;
        this.encryptionUtil = args.encryptionUtil;
        this.organizationWarehouseCredentialsModel =
            args.organizationWarehouseCredentialsModel;
    }

    async transaction<T>(
        run: (model: WarehouseConnectionModel) => Promise<T>,
    ): Promise<T> {
        return this.database.transaction((transaction) =>
            run(
                new WarehouseConnectionModel({
                    database: transaction,
                    encryptionUtil: this.encryptionUtil,
                    organizationWarehouseCredentialsModel:
                        this.organizationWarehouseCredentialsModel,
                }),
            ),
        );
    }

    async lockProject(projectUuid: string): Promise<void> {
        const row = await this.database('projects')
            .select('project_uuid')
            .where('project_uuid', projectUuid)
            .forUpdate()
            .first();
        if (!row) {
            throw new NotFoundError(
                `Cannot find project with id: ${projectUuid}`,
            );
        }
    }

    async getProject(projectUuid: string): Promise<WarehouseConnectionProject> {
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
                organization_uuid: string;
                connection_mode: ConnectionMode;
                warehouse_type: WarehouseTypes | null;
            }>(
                'projects.project_uuid',
                'organizations.organization_uuid',
                'projects.connection_mode',
                'warehouse_credentials.warehouse_type',
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
            organizationUuid: row.organization_uuid,
            connectionMode: row.connection_mode,
            originalWarehouseType: row.warehouse_type,
        };
    }

    private static toWarehouseConnection(
        row: DbWarehouseConnection,
        originalWarehouseType: WarehouseTypes | null,
    ): WarehouseConnection {
        const warehouseType = row.is_original
            ? originalWarehouseType
            : (row.warehouse_type as WarehouseTypes | null);
        if (warehouseType === null) {
            throw new UnexpectedServerError(
                `Warehouse connection ${row.warehouse_connection_uuid} has no warehouse type`,
            );
        }
        return {
            warehouseConnectionUuid: row.warehouse_connection_uuid,
            projectUuid: row.project_uuid,
            name: row.name,
            isOriginal: row.is_original,
            warehouseType,
            organizationWarehouseCredentialsUuid:
                row.organization_warehouse_credentials_uuid,
            listAllDatabases: row.list_all_databases,
            additionalDatabases: row.additional_databases,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }

    async list(
        project: WarehouseConnectionProject,
    ): Promise<WarehouseConnection[]> {
        const rows = await this.database<DbWarehouseConnection>(
            WAREHOUSE_CONNECTIONS_TABLE,
        )
            .where('project_uuid', project.projectUuid)
            .orderBy([
                { column: 'is_original', order: 'desc' },
                { column: 'created_at', order: 'asc' },
            ]);
        return rows.map((row) =>
            WarehouseConnectionModel.toWarehouseConnection(
                row,
                project.originalWarehouseType,
            ),
        );
    }

    private async getRow(
        projectUuid: string,
        warehouseConnectionUuid: string,
    ): Promise<DbWarehouseConnection> {
        const row = await this.database<DbWarehouseConnection>(
            WAREHOUSE_CONNECTIONS_TABLE,
        )
            .where('project_uuid', projectUuid)
            .where('warehouse_connection_uuid', warehouseConnectionUuid)
            .first();
        if (!row) {
            throw new NotFoundError('Connection not found');
        }
        return row;
    }

    async get(
        project: WarehouseConnectionProject,
        warehouseConnectionUuid: string,
    ): Promise<WarehouseConnection> {
        return WarehouseConnectionModel.toWarehouseConnection(
            await this.getRow(project.projectUuid, warehouseConnectionUuid),
            project.originalWarehouseType,
        );
    }

    async loadOrganizationCredentials(
        organizationUuid: string,
        organizationWarehouseCredentialsUuid: string,
    ): Promise<CreateWarehouseCredentials> {
        const organizationCredentials =
            await this.organizationWarehouseCredentialsModel.getByUuidWithSensitiveData(
                organizationWarehouseCredentialsUuid,
            );
        if (organizationCredentials.organizationUuid !== organizationUuid) {
            throw new NotFoundError(
                'Organization warehouse credentials not found',
            );
        }
        return organizationCredentials.credentials;
    }

    async getCredentials(
        project: WarehouseConnectionProject,
        warehouseConnectionUuid: string,
    ): Promise<CreateWarehouseCredentials> {
        const row = await this.getRow(
            project.projectUuid,
            warehouseConnectionUuid,
        );
        if (row.is_original) {
            throw new ParameterError(
                'The original connection keeps its credentials in the project settings.',
            );
        }
        if (row.organization_warehouse_credentials_uuid !== null) {
            return this.loadOrganizationCredentials(
                project.organizationUuid,
                row.organization_warehouse_credentials_uuid,
            );
        }
        if (row.encrypted_credentials === null) {
            throw new UnexpectedServerError(
                'Warehouse connection credentials are missing',
            );
        }
        try {
            return normalizeWarehouseCredentials(
                JSON.parse(
                    this.encryptionUtil.decrypt(row.encrypted_credentials),
                ) as CreateWarehouseCredentials,
            );
        } catch {
            throw new UnexpectedServerError(
                'Failed to load warehouse connection credentials',
            );
        }
    }

    private toCredentialColumns(source: WarehouseConnectionCredentialSource) {
        return source.kind === 'project'
            ? {
                  encrypted_credentials: this.encryptionUtil.encrypt(
                      JSON.stringify(
                          normalizeWarehouseCredentials(source.credentials),
                      ),
                  ),
                  organization_warehouse_credentials_uuid: null,
              }
            : {
                  encrypted_credentials: null,
                  organization_warehouse_credentials_uuid:
                      source.organizationWarehouseCredentialsUuid,
              };
    }

    async createExtra(
        project: WarehouseConnectionProject,
        input: CreateExtraWarehouseConnection,
    ): Promise<WarehouseConnection> {
        const [row] = await this.database<DbWarehouseConnection>(
            WAREHOUSE_CONNECTIONS_TABLE,
        )
            .insert({
                project_uuid: project.projectUuid,
                is_original: false,
                name: input.name,
                warehouse_type: input.warehouseType,
                ...this.toCredentialColumns(input.source),
                list_all_databases: input.listAllDatabases,
                additional_databases: input.additionalDatabases,
                created_by_user_uuid: input.createdByUserUuid,
            })
            .returning('*');
        return WarehouseConnectionModel.toWarehouseConnection(
            row,
            project.originalWarehouseType,
        );
    }

    async updateExtraCredentials(
        project: WarehouseConnectionProject,
        warehouseConnectionUuid: string,
        source: WarehouseConnectionCredentialSource,
    ): Promise<void> {
        await this.database(WAREHOUSE_CONNECTIONS_TABLE)
            .where('project_uuid', project.projectUuid)
            .where('warehouse_connection_uuid', warehouseConnectionUuid)
            .where('is_original', false)
            .update({
                ...this.toCredentialColumns(source),
                updated_at: this.database.fn.now(),
            });
    }

    async updateListingSettings(
        project: WarehouseConnectionProject,
        warehouseConnectionUuid: string,
        settings: WarehouseConnectionListingSettings,
    ): Promise<void> {
        await this.database(WAREHOUSE_CONNECTIONS_TABLE)
            .where('project_uuid', project.projectUuid)
            .where('warehouse_connection_uuid', warehouseConnectionUuid)
            .update({
                list_all_databases: settings.listAllDatabases,
                additional_databases: settings.additionalDatabases,
                updated_at: this.database.fn.now(),
            });
    }

    async rename(
        project: WarehouseConnectionProject,
        warehouseConnectionUuid: string,
        name: string,
    ): Promise<void> {
        await this.database(WAREHOUSE_CONNECTIONS_TABLE)
            .where('project_uuid', project.projectUuid)
            .where('warehouse_connection_uuid', warehouseConnectionUuid)
            .update({ name, updated_at: this.database.fn.now() });
    }

    private latestSqlChartVersions() {
        return this.database('saved_sql_versions')
            .distinctOn('saved_sql_uuid')
            .select('saved_sql_version_uuid')
            .orderBy([
                { column: 'saved_sql_uuid' },
                { column: 'created_at', order: 'desc' },
                { column: 'saved_sql_version_uuid', order: 'desc' },
            ]);
    }

    async getBoundContent(
        warehouseConnectionUuid: string,
    ): Promise<WarehouseConnectionBoundContent> {
        const [explores, dbtSources, sqlCharts, inFlightQueries] =
            await Promise.all([
                this.database('cached_explore')
                    .where('warehouse_connection_uuid', warehouseConnectionUuid)
                    .orderBy('name')
                    .pluck('name'),
                this.database('project_dbt_sources')
                    .where('warehouse_connection_uuid', warehouseConnectionUuid)
                    .orderBy('name')
                    .pluck('name'),
                this.database('saved_sql_versions')
                    .innerJoin(
                        'saved_sql',
                        'saved_sql.saved_sql_uuid',
                        'saved_sql_versions.saved_sql_uuid',
                    )
                    .where(
                        'saved_sql_versions.warehouse_connection_uuid',
                        warehouseConnectionUuid,
                    )
                    .whereIn(
                        'saved_sql_versions.saved_sql_version_uuid',
                        this.latestSqlChartVersions(),
                    )
                    .orderBy('saved_sql.name')
                    .select<{ name: string; deleted_at: Date | null }[]>(
                        'saved_sql.name',
                        'saved_sql.deleted_at',
                    ),
                this.database('query_history')
                    .where('warehouse_connection_uuid', warehouseConnectionUuid)
                    .whereIn('status', IN_FLIGHT_QUERY_STATUSES)
                    .count<{ count: string }[]>({ count: '*' }),
            ]);
        return {
            explores,
            dbtSources,
            sqlCharts: sqlCharts.map(({ name, deleted_at: deletedAt }) =>
                deletedAt === null ? name : `${name} (deleted)`,
            ),
            inFlightQueries: Number(inFlightQueries[0]?.count ?? 0),
        };
    }

    async clearOlderSqlChartVersionBindings(
        warehouseConnectionUuid: string,
    ): Promise<number> {
        return this.database<{
            saved_sql_version_uuid: string;
            warehouse_connection_uuid: string | null;
        }>('saved_sql_versions')
            .where('warehouse_connection_uuid', warehouseConnectionUuid)
            .whereNotIn('saved_sql_version_uuid', this.latestSqlChartVersions())
            .update({ warehouse_connection_uuid: null });
    }

    async deleteExtra(
        project: WarehouseConnectionProject,
        warehouseConnectionUuid: string,
    ): Promise<void> {
        await this.database(WAREHOUSE_CONNECTIONS_TABLE)
            .where('project_uuid', project.projectUuid)
            .where('warehouse_connection_uuid', warehouseConnectionUuid)
            .where('is_original', false)
            .delete();
    }

    async insertEvent(event: WarehouseConnectionEvent): Promise<void> {
        await this.database(EVENTS_TABLE).insert({
            project_uuid: event.projectUuid,
            actor_user_uuid: event.actorUserUuid,
            event: event.event,
            plan: JSON.stringify(event.plan),
        });
    }

    async assertBindingsBelongToProject(
        projectUuid: string,
        warehouseConnectionUuids: (string | null)[],
    ): Promise<void> {
        const requested = [
            ...new Set(
                warehouseConnectionUuids.filter(
                    (uuid): uuid is string => uuid !== null,
                ),
            ),
        ];
        if (requested.length === 0) return;
        const found = await this.database(WAREHOUSE_CONNECTIONS_TABLE)
            .where('project_uuid', projectUuid)
            .whereIn('warehouse_connection_uuid', requested)
            .pluck('warehouse_connection_uuid');
        const missing = requested.filter((uuid) => !found.includes(uuid));
        if (missing.length > 0) {
            throw new ParameterError(
                `Connection not found in this project: ${missing.join(', ')}`,
            );
        }
    }
}
