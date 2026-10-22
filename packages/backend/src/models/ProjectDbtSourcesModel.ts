import {
    AlreadyExistsError,
    CreateProjectDbtSource,
    DbtProjectConfig,
    ForbiddenError,
    NotFoundError,
    ParameterError,
    ProjectDbtSource,
    UnexpectedServerError,
    UpdateProjectDbtSource,
    type DbtRepositorySummary,
} from '@lightdash/common';
import { Knex } from 'knex';
import { DatabaseError } from 'pg';
import {
    DbProjectDbtSource,
    ProjectDbtSourcesTableName,
} from '../database/entities/projectDbtSources';
import { EncryptionUtil } from '../utils/EncryptionUtil/EncryptionUtil';
import { type FeatureFlagModel } from './FeatureFlagModel/FeatureFlagModel';
import {
    PeerDbtSourcesModel,
    type DbPeerDbtSource,
} from './PeerDbtSourcesModel';
import { normalizeStoredDbtConnection } from './ProjectModel/normalizeStoredDbtConnection';

const PG_UNIQUE_VIOLATION = '23505';

export type ApiProjectDbtSource = ProjectDbtSource & {
    sharedRepository?: DbtRepositorySummary;
    sanitizeRepository?: boolean;
};

export type BoundProjectDbtSource = ProjectDbtSource & {
    warehouseConnectionUuid: string | null;
};

type DbBoundProjectDbtSource = DbProjectDbtSource & {
    warehouse_connection_uuid: string | null;
};

type ProjectDbtSourcesModelArguments = {
    database: Knex;
    encryptionUtil: EncryptionUtil;
    featureFlagModel?: Pick<FeatureFlagModel, 'get'>;
};

/**
 * Data access for `project_dbt_sources` — the additional dbt sources connected
 * to a project beyond its primary `projects.dbt_connection` (PROD-7484). Rows
 * are returned ordered by precedence for both the sources list and merge fold.
 * The lowest precedence supplies manifest metadata and wins docs/macros unions;
 * model collisions fail separately. The primary source is not stored here; a
 * project with no rows runs the single-source path unchanged (N=0 short-circuit).
 */
export class ProjectDbtSourcesModel {
    readonly peers: PeerDbtSourcesModel;
    private readonly database: Knex;

    private readonly encryptionUtil: EncryptionUtil;

    private readonly featureFlagModel: ProjectDbtSourcesModelArguments['featureFlagModel'];

    constructor(args: ProjectDbtSourcesModelArguments) {
        this.database = args.database;
        this.encryptionUtil = args.encryptionUtil;
        this.featureFlagModel = args.featureFlagModel;
        this.peers = new PeerDbtSourcesModel(args);
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
                dbtConnection: normalizeStoredDbtConnection(
                    JSON.parse(
                        this.encryptionUtil.decrypt(encrypted),
                    ) as DbtProjectConfig,
                ),
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

    private async convertRows(
        projectUuid: string,
        rows: DbProjectDbtSource[],
    ): Promise<ProjectDbtSource[]> {
        if (rows.length === 0 || !(await this.peers.isEnabled(projectUuid)))
            return rows.map((row) => this.convertRow(row));
        await this.peers.ensureRepositories(projectUuid);
        return Promise.all(
            rows.map(async (row) => {
                const source = this.convertRow(row);
                const repositoryUuid = (
                    row as DbProjectDbtSource & {
                        dbt_repository_uuid: string | null;
                    }
                ).dbt_repository_uuid;
                if (!row.dbt_connection && repositoryUuid) {
                    try {
                        return {
                            ...source,
                            dbtConnection: await this.peers.resolveConnection(
                                projectUuid,
                                repositoryUuid,
                            ),
                        };
                    } catch {
                        return { ...source, hasCredentialError: true };
                    }
                }
                return source;
            }),
        );
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
        return this.convertRows(projectUuid, rows);
    }

    /**
     * Whether the project has any additional sources. Drives the N=0
     * short-circuit without decrypting connections.
     */
    async getSourcesForApi(
        projectUuid: string,
    ): Promise<ApiProjectDbtSource[]> {
        const rows = await this.database<DbPeerDbtSource>(
            ProjectDbtSourcesTableName,
        )
            .where('project_uuid', projectUuid)
            .orderBy('precedence', 'asc')
            .orderBy('name', 'asc');
        if (rows.length === 0 || !(await this.peers.isEnabled(projectUuid)))
            return rows.map((row) => this.convertRow(row));
        const settings = await this.peers.getSettings(projectUuid);
        return rows.map((row) => {
            const source = {
                ...this.convertRow(row),
                sanitizeRepository: true,
            };
            if (row.dbt_connection === null && row.dbt_repository_uuid) {
                const repository = settings.get(
                    row.project_dbt_source_uuid,
                )?.repository;
                return repository
                    ? { ...source, sharedRepository: repository }
                    : { ...source, hasCredentialError: true };
            }
            return source;
        });
    }

    async hasSources(projectUuid: string): Promise<boolean> {
        const row = await this.database(ProjectDbtSourcesTableName)
            .where('project_uuid', projectUuid)
            .first();
        return row !== undefined;
    }

    private async inTransaction<T>(
        action: (model: ProjectDbtSourcesModel) => Promise<T>,
    ): Promise<T> {
        return this.database.transaction((database) =>
            action(
                new ProjectDbtSourcesModel({
                    database,
                    encryptionUtil: this.encryptionUtil,
                    featureFlagModel: this.featureFlagModel,
                }),
            ),
        );
    }

    private async lockCopyProjects(
        sourceProjectUuid: string,
        targetProjectUuid: string,
    ): Promise<void> {
        await this.database('projects')
            .whereIn('project_uuid', [sourceProjectUuid, targetProjectUuid])
            .orderBy('project_uuid')
            .forUpdate();
    }

    async copySources(
        sourceProjectUuid: string,
        targetProjectUuid: string,
    ): Promise<void> {
        const peersEnabled = await this.peers.isEnabled(sourceProjectUuid);
        if (peersEnabled && !this.database.isTransaction)
            return this.inTransaction((model) =>
                model.copySources(sourceProjectUuid, targetProjectUuid),
            );
        if (peersEnabled)
            await this.lockCopyProjects(sourceProjectUuid, targetProjectUuid);
        const sources = await this.database<DbPeerDbtSource>(
            ProjectDbtSourcesTableName,
        )
            .select(
                'name',
                'is_primary',
                'precedence',
                'dbt_connection_type',
                'dbt_connection',
                'warehouse_database',
                'warehouse_schema',
            )
            .select(
                peersEnabled
                    ? [
                          'dbt_repository_uuid',
                          'dbt_project_name',
                          'dbt_project_name_conflict',
                          'membership_role',
                          'refresh_policy',
                      ]
                    : [],
            )
            .where('project_uuid', sourceProjectUuid);

        if (sources.length === 0) {
            return;
        }
        if (peersEnabled)
            await this.peers.assertRepositoriesCanBeCopied(
                targetProjectUuid,
                sources,
            );

        await this.database(ProjectDbtSourcesTableName).insert(
            sources.map((source) => ({
                project_uuid: targetProjectUuid,
                name: source.name,
                is_primary: source.is_primary,
                precedence: source.precedence,
                dbt_connection_type: source.dbt_connection_type,
                dbt_connection: source.dbt_connection,
                warehouse_database: source.warehouse_database,
                warehouse_schema: source.warehouse_schema,
                ...(peersEnabled
                    ? ProjectDbtSourcesModel.peerCopyFields(source)
                    : {}),
            })),
        );
    }

    private static peerCopyFields(
        source: Pick<
            DbPeerDbtSource,
            | 'dbt_repository_uuid'
            | 'dbt_project_name'
            | 'dbt_project_name_conflict'
            | 'membership_role'
            | 'refresh_policy'
        >,
    ) {
        return {
            dbt_repository_uuid: source.dbt_repository_uuid,
            dbt_project_name: source.dbt_project_name,
            dbt_project_name_conflict: source.dbt_project_name_conflict,
            membership_role: source.membership_role,
            refresh_policy: source.refresh_policy,
        };
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
        return (await this.convertRows(row.project_uuid, [row]))[0];
    }

    async getSourceForApi(
        projectDbtSourceUuid: string,
    ): Promise<ProjectDbtSource> {
        const row = await this.database(ProjectDbtSourcesTableName)
            .where('project_dbt_source_uuid', projectDbtSourceUuid)
            .first();
        if (!row)
            throw new NotFoundError(
                `Cannot find dbt source with id: ${projectDbtSourceUuid}`,
            );
        return this.convertRow(row);
    }

    async createSource(
        projectUuid: string,
        data: CreateProjectDbtSource,
    ): Promise<ProjectDbtSource> {
        try {
            if (await this.peers.isEnabled(projectUuid))
                return this.convertRow(
                    await this.peers.createSource(projectUuid, data),
                );
            const [row] = await this.database(ProjectDbtSourcesTableName)
                .insert({
                    project_uuid: projectUuid,
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
        const stored = await this.getSourceForApi(projectDbtSourceUuid);
        const peersEnabled = await this.peers.isEnabled(stored.projectUuid);
        if (peersEnabled && !this.database.isTransaction)
            return this.inTransaction((model) =>
                model.updateSource(projectDbtSourceUuid, data),
            );
        if (peersEnabled)
            await this.database('projects')
                .where('project_uuid', stored.projectUuid)
                .forUpdate()
                .first();
        if (data.dbtConnection !== undefined) {
            const existing = await this.getSource(projectDbtSourceUuid);
            if (
                await this.peers.isSharedConsumer(
                    existing.projectUuid,
                    projectDbtSourceUuid,
                )
            )
                throw new ForbiddenError(
                    'Edit shared repository credentials in the owning project',
                );
            await this.peers.assertConnectionChange(
                existing.projectUuid,
                projectDbtSourceUuid,
                data.dbtConnection,
            );
        }
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
        if (data.dbtConnection !== undefined)
            await this.peers.registerSource(
                row.project_uuid,
                row.project_dbt_source_uuid,
                data.dbtConnection,
            );
        return this.convertRow(row);
    }

    async deleteSource(projectDbtSourceUuid: string): Promise<void> {
        const source = await this.getSource(projectDbtSourceUuid);
        if (source.isPrimary) {
            throw new ParameterError(
                'Cannot delete the primary dbt source of a project',
            );
        }
        if (await this.peers.isEnabled(source.projectUuid))
            return this.peers.deleteSource(
                source.projectUuid,
                projectDbtSourceUuid,
            );
        await this.database(ProjectDbtSourcesTableName)
            .where('project_dbt_source_uuid', projectDbtSourceUuid)
            .delete();
    }

    async getSourcesWithBindings(
        projectUuid: string,
    ): Promise<BoundProjectDbtSource[]> {
        const rows = await this.database<DbBoundProjectDbtSource>(
            ProjectDbtSourcesTableName,
        )
            .where('project_uuid', projectUuid)
            .orderBy('precedence', 'asc')
            .orderBy('name', 'asc');
        const sources = await this.convertRows(projectUuid, rows);
        return sources.map((source, index) => ({
            ...source,
            warehouseConnectionUuid: rows[index].warehouse_connection_uuid,
        }));
    }

    async copySourcesWithConnectionMap(
        sourceProjectUuid: string,
        targetProjectUuid: string,
        warehouseConnectionUuidMap: ReadonlyMap<string, string>,
    ): Promise<void> {
        const peersEnabled = await this.peers.isEnabled(sourceProjectUuid);
        if (peersEnabled && !this.database.isTransaction)
            return this.inTransaction((model) =>
                model.copySourcesWithConnectionMap(
                    sourceProjectUuid,
                    targetProjectUuid,
                    warehouseConnectionUuidMap,
                ),
            );
        if (peersEnabled)
            await this.lockCopyProjects(sourceProjectUuid, targetProjectUuid);
        const sources = await this.database<DbPeerDbtSource>(
            ProjectDbtSourcesTableName,
        )
            .select(
                'name',
                'is_primary',
                'precedence',
                'dbt_connection_type',
                'dbt_connection',
                'warehouse_database',
                'warehouse_schema',
                'warehouse_connection_uuid',
            )
            .select(
                peersEnabled
                    ? [
                          'dbt_repository_uuid',
                          'dbt_project_name',
                          'dbt_project_name_conflict',
                          'membership_role',
                          'refresh_policy',
                      ]
                    : [],
            )
            .where('project_uuid', sourceProjectUuid);
        if (sources.length === 0) {
            return;
        }
        if (peersEnabled)
            await this.peers.assertRepositoriesCanBeCopied(
                targetProjectUuid,
                sources,
            );
        const rows = sources.map((source) => {
            const warehouseConnectionUuid =
                source.warehouse_connection_uuid === null
                    ? null
                    : warehouseConnectionUuidMap.get(
                          source.warehouse_connection_uuid,
                      );
            if (warehouseConnectionUuid === undefined) {
                throw new ParameterError(
                    `The copy has no connection for dbt source "${source.name}"`,
                );
            }
            return {
                project_uuid: targetProjectUuid,
                name: source.name,
                is_primary: source.is_primary,
                precedence: source.precedence,
                dbt_connection_type: source.dbt_connection_type,
                dbt_connection: source.dbt_connection,
                warehouse_database: source.warehouse_database,
                warehouse_schema: source.warehouse_schema,
                warehouse_connection_uuid: warehouseConnectionUuid,
                ...(peersEnabled
                    ? ProjectDbtSourcesModel.peerCopyFields(source)
                    : {}),
            };
        });
        await this.database<DbBoundProjectDbtSource>(
            ProjectDbtSourcesTableName,
        ).insert(rows);
    }
}
