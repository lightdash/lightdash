import {
    AlreadyExistsError,
    CreateProjectDbtSource,
    DbtProjectConfig,
    NotFoundError,
    ParameterError,
    ProjectDbtSource,
    UnexpectedServerError,
    UpdateProjectDbtSource,
} from '@lightdash/common';
import { Knex } from 'knex';
import { DatabaseError } from 'pg';
import {
    DbProjectDbtSource,
    ProjectDbtSourcesTableName,
} from '../database/entities/projectDbtSources';
import { ProjectTableName } from '../database/entities/projects';
import { WarehouseCredentialTableName } from '../database/entities/warehouseCredentials';
import { EncryptionUtil } from '../utils/EncryptionUtil/EncryptionUtil';

const PG_UNIQUE_VIOLATION = '23505';

type ProjectDbtSourcesModelArguments = {
    database: Knex;
    encryptionUtil: EncryptionUtil;
};

export class ProjectDbtSourcesModel {
    private readonly database: Knex;

    private readonly encryptionUtil: EncryptionUtil;

    constructor(args: ProjectDbtSourcesModelArguments) {
        this.database = args.database;
        this.encryptionUtil = args.encryptionUtil;
    }

    /**
     * Never throws: a source whose credentials cannot be decrypted (e.g. after
     * an encryption secret rotation) must not take down every other source in
     * the same list/compile — it is reported via `hasCredentialError` instead,
     * and the caller decides whether that source can be skipped (compiling,
     * listing) or must fail by name (editing, compiling only this source).
     */
    private tryDecryptConnection(encrypted: Buffer | null): {
        dbtConnection: DbtProjectConfig | null;
        hasCredentialError: boolean;
    } {
        if (!encrypted) {
            return { dbtConnection: null, hasCredentialError: false };
        }
        try {
            return {
                dbtConnection: JSON.parse(
                    this.encryptionUtil.decrypt(encrypted),
                ) as DbtProjectConfig,
                hasCredentialError: false,
            };
        } catch (e) {
            return { dbtConnection: null, hasCredentialError: true };
        }
    }

    private encryptConnection(
        connection: DbtProjectConfig | null | undefined,
    ): Buffer | null {
        if (!connection) {
            return null;
        }
        try {
            return this.encryptionUtil.encrypt(JSON.stringify(connection));
        } catch (e) {
            throw new UnexpectedServerError(
                'Could not save dbt source credentials',
            );
        }
    }

    private convertRow(row: DbProjectDbtSource): ProjectDbtSource {
        const { dbtConnection, hasCredentialError } = this.tryDecryptConnection(
            row.dbt_connection,
        );
        return {
            projectDbtSourceUuid: row.project_dbt_source_uuid,
            projectUuid: row.project_uuid,
            connectionUuid: row.connection_uuid,
            namespacePrefix: row.namespace_prefix,
            name: row.name,
            isPrimary: row.is_primary,
            precedence: row.precedence,
            dbtConnection,
            warehouseLocation: {
                database: row.warehouse_database,
                schema: row.warehouse_schema,
            },
            hasCredentialError,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }

    /**
     * All additional sources for a project, ordered by precedence then name
     * (the same order the merge fold uses). Empty when the project has none.
     */
    async getSources(projectUuid: string): Promise<ProjectDbtSource[]> {
        const rows = await this.database(ProjectDbtSourcesTableName)
            .where('project_uuid', projectUuid)
            .orderBy('precedence', 'asc')
            .orderBy('name', 'asc');
        return rows.map((row) => this.convertRow(row));
    }

    /**
     * Whether the project has any additional sources. Drives the N=0
     * short-circuit without decrypting connections.
     */
    async hasSources(projectUuid: string): Promise<boolean> {
        const row = await this.database(ProjectDbtSourcesTableName)
            .where('project_uuid', projectUuid)
            .first();
        return row !== undefined;
    }

    async copySources(
        sourceProjectUuid: string,
        targetProjectUuid: string,
    ): Promise<void> {
        const sources = await this.database(ProjectDbtSourcesTableName)
            .select(
                'name',
                'connection_uuid',
                'namespace_prefix',
                'is_primary',
                'precedence',
                'dbt_connection_type',
                'dbt_connection',
                'warehouse_database',
                'warehouse_schema',
            )
            .where('project_uuid', sourceProjectUuid);

        if (sources.length === 0) {
            return;
        }

        await this.database(ProjectDbtSourcesTableName).insert(
            sources.map((source) => ({
                project_uuid: targetProjectUuid,
                connection_uuid: source.connection_uuid,
                namespace_prefix: source.namespace_prefix,
                name: source.name,
                is_primary: source.is_primary,
                precedence: source.precedence,
                dbt_connection_type: source.dbt_connection_type,
                dbt_connection: source.dbt_connection,
                warehouse_database: source.warehouse_database,
                warehouse_schema: source.warehouse_schema,
            })),
        );
    }

    async getSource(projectDbtSourceUuid: string): Promise<ProjectDbtSource> {
        const row = await this.database(ProjectDbtSourcesTableName)
            .where('project_dbt_source_uuid', projectDbtSourceUuid)
            .first();
        if (!row) {
            throw new NotFoundError(
                `Cannot find dbt source with id: ${projectDbtSourceUuid}`,
            );
        }
        return this.convertRow(row);
    }

    /**
     * The primary source a project compiles through. It carries the project's
     * own dbt source identity, so the row a project is created with matches the
     * one the binding migration materialised for projects that predate it.
     */
    async createPrimarySource(
        projectUuid: string,
        data: {
            projectDbtSourceUuid: string;
            connectionUuid: string;
            name: string;
            dbtConnection: DbtProjectConfig | null;
        },
    ): Promise<ProjectDbtSource> {
        const [row] = await this.database(ProjectDbtSourcesTableName)
            .insert({
                project_dbt_source_uuid: data.projectDbtSourceUuid,
                project_uuid: projectUuid,
                connection_uuid: data.connectionUuid,
                namespace_prefix: '',
                name: data.name,
                is_primary: true,
                precedence: 0,
                dbt_connection_type: data.dbtConnection?.type ?? null,
                dbt_connection: this.encryptConnection(data.dbtConnection),
                warehouse_database: null,
                warehouse_schema: null,
            })
            .onConflict('project_dbt_source_uuid')
            .ignore()
            .returning('*');
        return row === undefined
            ? this.getSource(data.projectDbtSourceUuid)
            : this.convertRow(row);
    }

    async createSource(
        projectUuid: string,
        data: CreateProjectDbtSource,
    ): Promise<ProjectDbtSource> {
        try {
            const [row] = await this.database(ProjectDbtSourcesTableName)
                .insert({
                    project_uuid: projectUuid,
                    connection_uuid: data.connectionUuid,
                    namespace_prefix: data.namespacePrefix,
                    name: data.name,
                    is_primary: data.isPrimary,
                    precedence: data.precedence,
                    dbt_connection_type: data.dbtConnection?.type ?? null,
                    dbt_connection: this.encryptConnection(data.dbtConnection),
                    warehouse_database: data.warehouseLocation.database,
                    warehouse_schema: data.warehouseLocation.schema,
                })
                .returning('*');
            return this.convertRow(row);
        } catch (error) {
            if (
                error instanceof DatabaseError &&
                error.code === PG_UNIQUE_VIOLATION
            ) {
                throw new AlreadyExistsError(
                    `A dbt source named "${data.name}" already exists on this project`,
                );
            }
            throw error;
        }
    }

    async updateSource(
        projectDbtSourceUuid: string,
        data: UpdateProjectDbtSource,
    ): Promise<ProjectDbtSource> {
        let row: DbProjectDbtSource | undefined;
        try {
            [row] = await this.database(ProjectDbtSourcesTableName)
                .where('project_dbt_source_uuid', projectDbtSourceUuid)
                .update({
                    ...(data.connectionUuid !== undefined
                        ? { connection_uuid: data.connectionUuid }
                        : {}),
                    ...(data.name !== undefined ? { name: data.name } : {}),
                    ...(data.precedence !== undefined
                        ? { precedence: data.precedence }
                        : {}),
                    ...(data.dbtConnection !== undefined
                        ? {
                              dbt_connection_type:
                                  data.dbtConnection?.type ?? null,
                              dbt_connection: this.encryptConnection(
                                  data.dbtConnection,
                              ),
                          }
                        : {}),
                    ...(data.warehouseLocation !== undefined
                        ? {
                              warehouse_database:
                                  data.warehouseLocation.database,
                              warehouse_schema: data.warehouseLocation.schema,
                          }
                        : {}),
                    updated_at: new Date(),
                })
                .returning('*');
        } catch (error) {
            if (
                error instanceof DatabaseError &&
                error.code === PG_UNIQUE_VIOLATION &&
                data.name !== undefined
            ) {
                throw new AlreadyExistsError(
                    `A dbt source named "${data.name}" already exists on this project`,
                );
            }
            throw error;
        }
        if (!row) {
            throw new NotFoundError(
                `Cannot find dbt source with id: ${projectDbtSourceUuid}`,
            );
        }
        return this.convertRow(row);
    }

    /**
     * The project's one live connection, or null when it has none or several.
     * A primary source binds to it when the project is created; with no clear
     * single answer the project is left without one, as the binding migration
     * left the same set.
     */
    async findSoleConnectionUuid(projectUuid: string): Promise<string | null> {
        const connections = await this.database(
            `${WarehouseCredentialTableName} as connection`,
        )
            .innerJoin(
                `${ProjectTableName} as project`,
                'connection.project_id',
                'project.project_id',
            )
            .where('project.project_uuid', projectUuid)
            .whereNull('connection.superseded_at')
            .limit(2)
            .select<{ warehouse_credentials_uuid: string }[]>(
                'connection.warehouse_credentials_uuid',
            );
        return connections.length === 1
            ? connections[0].warehouse_credentials_uuid
            : null;
    }

    async connectionBelongsToProject(
        projectUuid: string,
        connectionUuid: string,
    ): Promise<boolean> {
        const connection = await this.database(
            `${WarehouseCredentialTableName} as connection`,
        )
            .innerJoin(
                `${ProjectTableName} as project`,
                'connection.project_id',
                'project.project_id',
            )
            .where('project.project_uuid', projectUuid)
            .where('connection.warehouse_credentials_uuid', connectionUuid)
            .whereNull('connection.superseded_at')
            .first('connection.warehouse_credentials_uuid');
        return connection !== undefined;
    }

    async deleteSource(projectDbtSourceUuid: string): Promise<void> {
        const source = await this.getSource(projectDbtSourceUuid);
        if (source.isPrimary) {
            throw new ParameterError(
                'Cannot delete the primary dbt source of a project',
            );
        }
        await this.database(ProjectDbtSourcesTableName)
            .where('project_dbt_source_uuid', projectDbtSourceUuid)
            .delete();
    }
}
