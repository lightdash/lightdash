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

const BINDING_COLUMNS = ['connection_uuid', 'namespace_prefix'] as const;

type ProjectDbtSourcesModelArguments = {
    database: Knex;
    encryptionUtil: EncryptionUtil;
};

/**
 * Data access for `project_dbt_sources` — the additional dbt sources connected
 * to a project beyond its primary `projects.dbt_connection` (PROD-7484). Rows
 * are returned ordered by precedence for both the sources list and merge fold.
 * The lowest precedence supplies manifest metadata and wins docs/macros unions;
 * model collisions fail separately. Once the binding migration runs, the
 * primary is also stored here as an `is_primary` row materialised from the
 * project's own identity; readers split it back out via getSourcesWithPrimary,
 * and a project with no rows runs the single-source path unchanged (N=0
 * short-circuit).
 */
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
            name: row.name,
            isPrimary: row.is_primary ?? false,
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
        const { additionalSources } =
            await this.getSourcesWithPrimary(projectUuid);
        return additionalSources;
    }

    async getSourcesWithPrimary(projectUuid: string): Promise<{
        primarySource: ProjectDbtSource | null;
        additionalSources: ProjectDbtSource[];
    }> {
        const rows = await this.database(ProjectDbtSourcesTableName)
            .where('project_uuid', projectUuid)
            .orderBy('precedence', 'asc')
            .orderBy('name', 'asc');
        const sources = rows.map((row) => this.convertRow(row));
        return {
            primarySource: sources.find((source) => source.isPrimary) ?? null,
            additionalSources: sources.filter((source) => !source.isPrimary),
        };
    }

    /**
     * Whether the project has any additional sources. Drives the N=0
     * short-circuit without decrypting connections.
     */
    async hasSources(projectUuid: string): Promise<boolean> {
        const row = await this.database(ProjectDbtSourcesTableName)
            .where('project_uuid', projectUuid)
            .where('is_primary', false)
            .first();
        return row !== undefined;
    }

    private static async lockTableAgainstConcurrentDdl(
        database: Knex,
        tableName: string,
    ): Promise<void> {
        await database.raw('LOCK TABLE ?? IN ACCESS SHARE MODE', [tableName]);
    }

    private static async getBindingColumns(database: Knex): Promise<{
        hasConnectionUuid: boolean;
        hasNamespacePrefix: boolean;
    }> {
        const rows = await database('information_schema.columns')
            .select<{ column_name: string }[]>('column_name')
            .where('table_name', ProjectDbtSourcesTableName)
            .whereIn('column_name', [...BINDING_COLUMNS]);
        const present = new Set(rows.map((row) => row.column_name));
        return {
            hasConnectionUuid: present.has('connection_uuid'),
            hasNamespacePrefix: present.has('namespace_prefix'),
        };
    }

    private static async getActiveConnectionUuids(
        database: Knex,
        projectUuid: string,
    ): Promise<string[]> {
        const query = database(WarehouseCredentialTableName)
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${WarehouseCredentialTableName}.project_id`,
            )
            .where(`${ProjectTableName}.project_uuid`, projectUuid)
            .select<{ warehouse_credentials_uuid: string }[]>(
                `${WarehouseCredentialTableName}.warehouse_credentials_uuid`,
            )
            .limit(2);
        if (
            await database.schema.hasColumn(
                WarehouseCredentialTableName,
                'superseded_at',
            )
        ) {
            void query.whereNull(
                `${WarehouseCredentialTableName}.superseded_at`,
            );
        }
        const rows = await query;
        return rows.map((row) => row.warehouse_credentials_uuid);
    }

    private async getSoleActiveConnectionUuid(
        database: Knex,
        projectUuid: string,
    ): Promise<string> {
        const connections =
            await ProjectDbtSourcesModel.getActiveConnectionUuids(
                database,
                projectUuid,
            );
        if (connections.length !== 1) {
            throw new ParameterError(
                'The project must have exactly one active connection.',
            );
        }
        return connections[0];
    }

    async copySources(
        sourceProjectUuid: string,
        targetProjectUuid: string,
    ): Promise<void> {
        await this.database.transaction(async (trx) => {
            await ProjectDbtSourcesModel.lockTableAgainstConcurrentDdl(
                trx,
                ProjectDbtSourcesTableName,
            );
            await ProjectDbtSourcesModel.lockTableAgainstConcurrentDdl(
                trx,
                WarehouseCredentialTableName,
            );
            const { hasConnectionUuid, hasNamespacePrefix } =
                await ProjectDbtSourcesModel.getBindingColumns(trx);
            const baseColumns = [
                'name',
                'is_primary',
                'precedence',
                'dbt_connection_type',
                'dbt_connection',
                'warehouse_database',
                'warehouse_schema',
            ] as const;
            const sources = await trx(ProjectDbtSourcesTableName)
                .where('project_uuid', sourceProjectUuid)
                .select<
                    (Pick<DbProjectDbtSource, (typeof baseColumns)[number]> & {
                        namespace_prefix?: string;
                    })[]
                >(
                    hasNamespacePrefix
                        ? [...baseColumns, 'namespace_prefix']
                        : [...baseColumns],
                );

            const additionalSources = hasConnectionUuid
                ? sources.filter((source) => !source.is_primary)
                : sources;
            if (additionalSources.length === 0) {
                return;
            }

            const connectionUuid = hasConnectionUuid
                ? await this.getSoleActiveConnectionUuid(trx, targetProjectUuid)
                : undefined;

            await trx(ProjectDbtSourcesTableName).insert(
                additionalSources.map((source) => ({
                    project_uuid: targetProjectUuid,
                    ...(connectionUuid !== undefined
                        ? { connection_uuid: connectionUuid }
                        : {}),
                    ...(hasNamespacePrefix
                        ? { namespace_prefix: source.namespace_prefix ?? '' }
                        : {}),
                    name: source.name,
                    is_primary: source.is_primary,
                    precedence: source.precedence,
                    dbt_connection_type: source.dbt_connection_type,
                    dbt_connection: source.dbt_connection,
                    warehouse_database: source.warehouse_database,
                    warehouse_schema: source.warehouse_schema,
                })),
            );
        });
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

    async createPrimarySource(
        projectUuid: string,
        data: {
            projectDbtSourceUuid: string;
            name: string;
            dbtConnection: DbtProjectConfig | null;
        },
    ): Promise<void> {
        await this.database.transaction(async (trx) => {
            await ProjectDbtSourcesModel.lockTableAgainstConcurrentDdl(
                trx,
                ProjectDbtSourcesTableName,
            );
            await ProjectDbtSourcesModel.lockTableAgainstConcurrentDdl(
                trx,
                WarehouseCredentialTableName,
            );
            const { hasConnectionUuid, hasNamespacePrefix } =
                await ProjectDbtSourcesModel.getBindingColumns(trx);
            if (!hasConnectionUuid) {
                return;
            }
            const connections =
                await ProjectDbtSourcesModel.getActiveConnectionUuids(
                    trx,
                    projectUuid,
                );
            if (connections.length !== 1) {
                return;
            }
            await trx(ProjectDbtSourcesTableName)
                .insert({
                    project_dbt_source_uuid: data.projectDbtSourceUuid,
                    project_uuid: projectUuid,
                    connection_uuid: connections[0],
                    ...(hasNamespacePrefix ? { namespace_prefix: '' } : {}),
                    name: data.name,
                    is_primary: true,
                    precedence: 0,
                    dbt_connection_type: data.dbtConnection?.type ?? null,
                    dbt_connection: this.encryptConnection(data.dbtConnection),
                    warehouse_database: null,
                    warehouse_schema: null,
                })
                .onConflict('project_dbt_source_uuid')
                .ignore();
        });
    }

    async createSource(
        projectUuid: string,
        data: CreateProjectDbtSource,
    ): Promise<ProjectDbtSource> {
        try {
            return await this.database.transaction(async (trx) => {
                await ProjectDbtSourcesModel.lockTableAgainstConcurrentDdl(
                    trx,
                    ProjectDbtSourcesTableName,
                );
                await ProjectDbtSourcesModel.lockTableAgainstConcurrentDdl(
                    trx,
                    WarehouseCredentialTableName,
                );
                const { hasConnectionUuid, hasNamespacePrefix } =
                    await ProjectDbtSourcesModel.getBindingColumns(trx);
                const connectionUuid = hasConnectionUuid
                    ? await this.getSoleActiveConnectionUuid(trx, projectUuid)
                    : undefined;
                const [row] = await trx(ProjectDbtSourcesTableName)
                    .insert({
                        project_uuid: projectUuid,
                        ...(connectionUuid !== undefined
                            ? { connection_uuid: connectionUuid }
                            : {}),
                        ...(hasNamespacePrefix
                            ? {
                                  namespace_prefix: data.isPrimary
                                      ? ''
                                      : data.name,
                              }
                            : {}),
                        name: data.name,
                        is_primary: data.isPrimary,
                        precedence: data.precedence,
                        dbt_connection_type: data.dbtConnection?.type ?? null,
                        dbt_connection: this.encryptConnection(
                            data.dbtConnection,
                        ),
                        warehouse_database: data.warehouseLocation.database,
                        warehouse_schema: data.warehouseLocation.schema,
                    })
                    .returning('*');
                return this.convertRow(row);
            });
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
