import {
    Connection,
    CreateWarehouseCredentials,
    MultipleConnectionsError,
    normalizeWarehouseCredentials,
    NotFoundError,
    QueryHistoryStatus,
    UnexpectedServerError,
    WarehouseTypes,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    WarehouseCredentialTableName,
    warehouseTypeDisplayNames,
} from '../../database/entities/warehouseCredentials';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';

type ConnectionRow = {
    warehouse_credentials_uuid: string;
    name: string;
    warehouse_type: WarehouseTypes;
    organization_warehouse_credentials_uuid: string | null;
    list_all_databases: boolean;
    additional_databases: string[];
    created_at: Date;
    encrypted_credentials: Buffer | null;
    project_id: number;
    organization_uuid: string;
};

export type ConnectionWriteInput = {
    warehouseConnection: CreateWarehouseCredentials;
    organizationWarehouseCredentialsUuid?: string | null;
    name?: string;
};

export type ConnectionBoundContent = {
    cached_explore: number;
    saved_sql_versions: number;
    project_dbt_sources: number;
    query_history: number;
};

type ConnectionModelArguments = {
    database: Knex;
    encryptionUtil: EncryptionUtil;
};

const normalizeAdditionalDatabases = (databases: string[] = []): string[] => [
    ...new Set(databases.map((database) => database.trim()).filter(Boolean)),
];

const toConnection = (row: ConnectionRow): Connection => ({
    connectionUuid: row.warehouse_credentials_uuid,
    name: row.name,
    warehouseType: row.warehouse_type,
    organizationWarehouseCredentialsUuid:
        row.organization_warehouse_credentials_uuid,
    listAllDatabases: row.list_all_databases,
    additionalDatabases: row.additional_databases,
    createdAt: row.created_at,
});

export class ConnectionModel {
    private readonly database: Knex;

    private readonly encryptionUtil: EncryptionUtil;

    constructor({ database, encryptionUtil }: ConnectionModelArguments) {
        this.database = database;
        this.encryptionUtil = encryptionUtil;
    }

    async transaction<T>(
        callback: (transactionModel: ConnectionModel) => Promise<T>,
    ): Promise<T> {
        return this.database.transaction((trx) =>
            callback(
                new ConnectionModel({
                    database: trx,
                    encryptionUtil: this.encryptionUtil,
                }),
            ),
        );
    }

    private baseQuery() {
        return this.database(WarehouseCredentialTableName)
            .innerJoin(
                'projects',
                `${WarehouseCredentialTableName}.project_id`,
                'projects.project_id',
            )
            .innerJoin(
                'organizations',
                'organizations.organization_id',
                'projects.organization_id',
            )
            .whereNull(`${WarehouseCredentialTableName}.superseded_at`);
    }

    private static selectColumns = [
        `${WarehouseCredentialTableName}.warehouse_credentials_uuid`,
        `${WarehouseCredentialTableName}.name`,
        `${WarehouseCredentialTableName}.warehouse_type`,
        `${WarehouseCredentialTableName}.organization_warehouse_credentials_uuid`,
        `${WarehouseCredentialTableName}.list_all_databases`,
        `${WarehouseCredentialTableName}.additional_databases`,
        `${WarehouseCredentialTableName}.created_at`,
        `${WarehouseCredentialTableName}.encrypted_credentials`,
        `${WarehouseCredentialTableName}.project_id`,
        'organizations.organization_uuid',
    ];

    private async getRow(
        projectUuid: string,
        connectionUuid: string,
    ): Promise<ConnectionRow> {
        const row = await this.baseQuery()
            .where('projects.project_uuid', projectUuid)
            .where(
                `${WarehouseCredentialTableName}.warehouse_credentials_uuid`,
                connectionUuid,
            )
            .select<ConnectionRow[]>(ConnectionModel.selectColumns)
            .first();
        if (!row) {
            throw new NotFoundError('Connection not found');
        }
        return row;
    }

    private async getOrganizationCredentials(
        organizationWarehouseCredentialsUuid: string,
        organizationUuid: string,
    ): Promise<CreateWarehouseCredentials> {
        const row = await this.database('organization_warehouse_credentials')
            .where(
                'organization_warehouse_credentials_uuid',
                organizationWarehouseCredentialsUuid,
            )
            .where('organization_uuid', organizationUuid)
            .select('warehouse_connection')
            .first();
        if (!row) {
            throw new NotFoundError(
                'Organization warehouse credentials not found',
            );
        }
        try {
            return normalizeWarehouseCredentials(
                JSON.parse(
                    this.encryptionUtil.decrypt(row.warehouse_connection),
                ) as CreateWarehouseCredentials,
            );
        } catch {
            throw new UnexpectedServerError(
                'Failed to load organization warehouse credentials',
            );
        }
    }

    private async getProject(projectUuid: string): Promise<{
        project_id: number;
        organization_uuid: string;
    }> {
        const project = await this.database('projects')
            .innerJoin(
                'organizations',
                'organizations.organization_id',
                'projects.organization_id',
            )
            .where('projects.project_uuid', projectUuid)
            .select('projects.project_id', 'organizations.organization_uuid')
            .first();
        if (!project) {
            throw new NotFoundError(
                `Cannot find project with id: ${projectUuid}`,
            );
        }
        return project;
    }

    async lockProject(projectUuid: string): Promise<{
        organizationUuid: string;
    }> {
        const project = await this.getProject(projectUuid);
        await this.database.raw('SELECT pg_advisory_xact_lock(?)', [
            project.project_id,
        ]);
        return { organizationUuid: project.organization_uuid };
    }

    async contractApplied(): Promise<boolean> {
        const constraint = await this.database('pg_constraint')
            .where('conname', 'warehouse_credentials_project_id_unique')
            .whereRaw(`conrelid = '${WarehouseCredentialTableName}'::regclass`)
            .first('conname');
        return constraint === undefined;
    }

    private encryptCredentials(credentials: CreateWarehouseCredentials) {
        try {
            return this.encryptionUtil.encrypt(JSON.stringify(credentials));
        } catch {
            throw new UnexpectedServerError('Could not save credentials.');
        }
    }

    async listByProject(projectUuid: string): Promise<Connection[]> {
        const rows = await this.baseQuery()
            .where('projects.project_uuid', projectUuid)
            .select<ConnectionRow[]>(ConnectionModel.selectColumns)
            .orderBy(`${WarehouseCredentialTableName}.created_at`, 'asc');
        return rows.map(toConnection);
    }

    async getByUuid(
        projectUuid: string,
        connectionUuid: string,
    ): Promise<Connection> {
        return toConnection(await this.getRow(projectUuid, connectionUuid));
    }

    async getCredentials(
        projectUuid: string,
        connectionUuid: string,
    ): Promise<CreateWarehouseCredentials> {
        const row = await this.getRow(projectUuid, connectionUuid);
        let credentials: CreateWarehouseCredentials;
        if (row.organization_warehouse_credentials_uuid) {
            credentials = await this.getOrganizationCredentials(
                row.organization_warehouse_credentials_uuid,
                row.organization_uuid,
            );
        } else if (row.encrypted_credentials) {
            try {
                credentials = normalizeWarehouseCredentials(
                    JSON.parse(
                        this.encryptionUtil.decrypt(row.encrypted_credentials),
                    ) as CreateWarehouseCredentials,
                );
            } catch {
                throw new UnexpectedServerError(
                    'Unexpected error: failed to parse warehouse credentials',
                );
            }
        } else {
            throw new UnexpectedServerError(
                'Unexpected error: warehouse credentials are missing',
            );
        }
        return {
            ...credentials,
            listAllDatabases: row.list_all_databases,
            additionalDatabases: row.additional_databases,
        };
    }

    async getOrganizationCredentialsForProject(
        projectUuid: string,
        organizationWarehouseCredentialsUuid: string,
    ): Promise<CreateWarehouseCredentials> {
        const project = await this.getProject(projectUuid);
        return this.getOrganizationCredentials(
            organizationWarehouseCredentialsUuid,
            project.organization_uuid,
        );
    }

    async resolveSole(projectUuid: string): Promise<Connection> {
        const connections = await this.listByProject(projectUuid);
        if (connections.length === 0) {
            throw new NotFoundError(
                'Cannot find any warehouse credentials for project.',
            );
        }
        if (connections.length > 1) {
            throw new MultipleConnectionsError();
        }
        return connections[0];
    }

    async create(
        projectUuid: string,
        input: ConnectionWriteInput,
    ): Promise<Connection> {
        const project = await this.getProject(projectUuid);
        const {
            listAllDatabases = false,
            additionalDatabases = [],
            ...normalizedCredentials
        } = normalizeWarehouseCredentials(input.warehouseConnection);
        const organizationWarehouseCredentialsUuid =
            input.organizationWarehouseCredentialsUuid ?? null;
        const storedCredentials = organizationWarehouseCredentialsUuid
            ? await this.getOrganizationCredentials(
                  organizationWarehouseCredentialsUuid,
                  project.organization_uuid,
              )
            : normalizedCredentials;
        const [row] = await this.database(WarehouseCredentialTableName)
            .insert({
                project_id: project.project_id,
                warehouse_type: storedCredentials.type,
                name:
                    input.name ??
                    warehouseTypeDisplayNames[storedCredentials.type],
                encrypted_credentials: organizationWarehouseCredentialsUuid
                    ? null
                    : this.encryptCredentials(normalizedCredentials),
                organization_warehouse_credentials_uuid:
                    organizationWarehouseCredentialsUuid,
                list_all_databases: listAllDatabases,
                additional_databases:
                    normalizeAdditionalDatabases(additionalDatabases),
            })
            .returning('warehouse_credentials_uuid');
        return this.getByUuid(projectUuid, row.warehouse_credentials_uuid);
    }

    async update(
        projectUuid: string,
        connectionUuid: string,
        input: ConnectionWriteInput,
    ): Promise<Connection> {
        const row = await this.getRow(projectUuid, connectionUuid);
        const {
            listAllDatabases = false,
            additionalDatabases = [],
            ...normalizedCredentials
        } = normalizeWarehouseCredentials(input.warehouseConnection);
        const organizationWarehouseCredentialsUuid =
            input.organizationWarehouseCredentialsUuid ?? null;
        const storedCredentials = organizationWarehouseCredentialsUuid
            ? await this.getOrganizationCredentials(
                  organizationWarehouseCredentialsUuid,
                  row.organization_uuid,
              )
            : normalizedCredentials;
        await this.database(WarehouseCredentialTableName)
            .where('project_id', row.project_id)
            .where('warehouse_credentials_uuid', connectionUuid)
            .whereNull('superseded_at')
            .update({
                warehouse_type: storedCredentials.type,
                organization_warehouse_credentials_uuid:
                    organizationWarehouseCredentialsUuid,
                list_all_databases: listAllDatabases,
                additional_databases:
                    normalizeAdditionalDatabases(additionalDatabases),
                encrypted_credentials: organizationWarehouseCredentialsUuid
                    ? null
                    : this.encryptCredentials(normalizedCredentials),
            });
        return this.getByUuid(projectUuid, connectionUuid);
    }

    async rename(
        projectUuid: string,
        connectionUuid: string,
        name: string,
    ): Promise<Connection> {
        const row = await this.getRow(projectUuid, connectionUuid);
        await this.database(WarehouseCredentialTableName)
            .where('project_id', row.project_id)
            .where('warehouse_credentials_uuid', connectionUuid)
            .whereNull('superseded_at')
            .update({ name });
        return this.getByUuid(projectUuid, connectionUuid);
    }

    private async countBoundRows(
        table: string,
        connectionUuid: string,
        configureQuery?: (query: Knex.QueryBuilder) => void,
    ): Promise<number> {
        const query = this.database(table).where(
            'connection_uuid',
            connectionUuid,
        );
        configureQuery?.(query);
        const result = await query
            .count<{ count: string }[]>('* as count')
            .first();
        return Number(result?.count ?? 0);
    }

    async hasBoundContent(
        connectionUuid: string,
    ): Promise<ConnectionBoundContent> {
        const projectDbtSourcesHaveConnection =
            await this.database.schema.hasColumn(
                'project_dbt_sources',
                'connection_uuid',
            );
        const [
            cachedExplore,
            savedSqlVersions,
            projectDbtSources,
            queryHistory,
        ] = await Promise.all([
            this.countBoundRows('cached_explore', connectionUuid),
            this.countBoundRows('saved_sql_versions', connectionUuid),
            projectDbtSourcesHaveConnection
                ? this.countBoundRows('project_dbt_sources', connectionUuid)
                : Promise.resolve(0),
            this.countBoundRows(
                'query_history',
                connectionUuid,
                (query) =>
                    void query.whereIn('status', [
                        QueryHistoryStatus.PENDING,
                        QueryHistoryStatus.QUEUED,
                        QueryHistoryStatus.EXECUTING,
                    ]),
            ),
        ]);
        return {
            cached_explore: cachedExplore,
            saved_sql_versions: savedSqlVersions,
            project_dbt_sources: projectDbtSources,
            query_history: queryHistory,
        };
    }

    async delete(projectUuid: string, connectionUuid: string): Promise<void> {
        const row = await this.getRow(projectUuid, connectionUuid);
        await this.database(WarehouseCredentialTableName)
            .where('project_id', row.project_id)
            .where('warehouse_credentials_uuid', connectionUuid)
            .whereNull('superseded_at')
            .delete();
    }
}
