import {
    ConflictError,
    DbtProjectType,
    FeatureFlags,
    ForbiddenError,
    normalizeDbtProjectName,
    NotFoundError,
    ParameterError,
    validateDbtProjectName,
    type AddSharedDbtSource,
    type CreateProjectDbtSource,
    type DbtProjectConfig,
    type DbtRepositorySummary,
    type PeerDbtSourceSettings,
    type UpdatePeerDbtSource,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { type DbProjectDbtSource } from '../database/entities/projectDbtSources';
import { type EncryptionUtil } from '../utils/EncryptionUtil/EncryptionUtil';
import { dbtRepositoryIdentity } from './dbtRepositoryIdentity';
import { type FeatureFlagModel } from './FeatureFlagModel/FeatureFlagModel';
import { normalizeStoredDbtConnection } from './ProjectModel/normalizeStoredDbtConnection';

export type DbPeerDbtSource = DbProjectDbtSource & {
    dbt_repository_uuid: string | null;
    dbt_project_name: string | null;
    dbt_project_name_conflict: string | null;
    warehouse_connection_uuid: string | null;
    membership_role: 'publish' | 'dependency_only';
    refresh_policy: 'git_refresh' | 'ci_managed';
};

type DbDbtRepository = {
    dbt_repository_uuid: string;
    organization_uuid: string;
    provider: string;
    host: string;
    owner: string;
    name: string;
    default_branch: string | null;
    dbt_project_name: string | null;
    credential_project_uuid: string | null;
    credential_source_uuid: string | null;
    created_by_project_uuid: string | null;
    is_shared: boolean;
    created_at: Date;
    updated_at: Date;
};

export class PeerDbtSourcesModel {
    constructor(
        private readonly args: {
            database: Knex;
            encryptionUtil: EncryptionUtil;
            featureFlagModel?: Pick<FeatureFlagModel, 'get'>;
        },
    ) {}

    async isEnabled(projectUuid: string): Promise<boolean> {
        if (!this.args.featureFlagModel) return false;
        const project = await this.args
            .database('projects')
            .join(
                'organizations',
                'projects.organization_id',
                'organizations.organization_id',
            )
            .select('organizations.organization_uuid')
            .where('projects.project_uuid', projectUuid)
            .first();
        if (!project) throw new NotFoundError('Cannot find project');
        return (
            await this.args.featureFlagModel.get({
                user: { organizationUuid: project.organization_uuid },
                featureFlagId: FeatureFlags.PeerDbtSources,
            })
        ).enabled;
    }

    static repositorySummary(row: DbDbtRepository): DbtRepositorySummary {
        return {
            dbtRepositoryUuid: row.dbt_repository_uuid,
            provider: row.provider,
            host: row.host,
            owner: row.owner,
            name: row.name,
            defaultBranch: row.default_branch,
            dbtProjectName: row.dbt_project_name,
            createdByProjectUuid: row.created_by_project_uuid,
            isShared: row.is_shared,
        };
    }

    private static matchesRepository(
        connection: DbtProjectConfig,
        repository: Pick<
            DbDbtRepository,
            'provider' | 'host' | 'owner' | 'name'
        >,
    ): boolean {
        const identity = dbtRepositoryIdentity(connection);
        return (
            identity !== null &&
            identity.provider === repository.provider &&
            identity.host === repository.host &&
            identity.owner === repository.owner &&
            identity.name === repository.name
        );
    }

    async ensureRepositories(projectUuid: string): Promise<void> {
        const rows = await this.args
            .database<DbPeerDbtSource>('project_dbt_sources')
            .where('project_uuid', projectUuid)
            .whereNull('dbt_repository_uuid')
            .whereNotNull('dbt_connection');
        await rows.reduce(async (previous, row) => {
            await previous;
            let connection: DbtProjectConfig;
            try {
                connection = normalizeStoredDbtConnection(
                    JSON.parse(
                        this.args.encryptionUtil.decrypt(row.dbt_connection!),
                    ) as DbtProjectConfig,
                );
            } catch {
                return;
            }
            if (!dbtRepositoryIdentity(connection)) return;
            await this.registerSource(
                projectUuid,
                row.project_dbt_source_uuid,
                connection,
                { reportNameConflicts: true },
            );
            await this.args
                .database<DbPeerDbtSource>('project_dbt_sources')
                .where('project_dbt_source_uuid', row.project_dbt_source_uuid)
                .whereNotNull('dbt_repository_uuid')
                .update({ refresh_policy: 'git_refresh' });
        }, Promise.resolve());
    }

    async getSettings(
        projectUuid: string,
    ): Promise<Map<string, PeerDbtSourceSettings>> {
        await this.ensureRepositories(projectUuid);
        const rows = await this.args
            .database<DbPeerDbtSource>('project_dbt_sources')
            .where('project_uuid', projectUuid);
        const repositories = await this.args
            .database<DbDbtRepository>('dbt_repositories')
            .whereIn(
                'dbt_repository_uuid',
                rows.flatMap((row) =>
                    row.dbt_repository_uuid ? [row.dbt_repository_uuid] : [],
                ),
            );
        const byUuid = new Map(
            repositories
                .filter(
                    (row) =>
                        row.created_by_project_uuid === projectUuid ||
                        row.is_shared,
                )
                .map((row) => [
                    row.dbt_repository_uuid,
                    PeerDbtSourcesModel.repositorySummary(row),
                ]),
        );
        return new Map(
            rows.map((row) => [
                row.project_dbt_source_uuid,
                {
                    usesSharedCredentials:
                        row.dbt_connection === null &&
                        row.dbt_repository_uuid !== null,
                    dbtRepositoryUuid: row.dbt_repository_uuid,
                    dbtProjectName: row.dbt_project_name,
                    dbtProjectNameConflict: row.dbt_project_name_conflict,
                    warehouseConnectionUuid: row.warehouse_connection_uuid,
                    membershipRole: row.membership_role,
                    refreshPolicy: row.refresh_policy,
                    repository: row.dbt_repository_uuid
                        ? (byUuid.get(row.dbt_repository_uuid) ?? null)
                        : null,
                },
            ]),
        );
    }

    private static async assertUniqueName(
        trx: Knex,
        source: DbPeerDbtSource,
        name: string | null,
    ): Promise<void> {
        if (!name) return;
        const conflict = await trx<DbPeerDbtSource>('project_dbt_sources')
            .where({
                project_uuid: source.project_uuid,
                dbt_project_name: name,
            })
            .whereNot('project_dbt_source_uuid', source.project_dbt_source_uuid)
            .whereRaw(
                'warehouse_connection_uuid IS NOT DISTINCT FROM ?::uuid',
                [source.warehouse_connection_uuid],
            )
            .first();
        if (conflict)
            throw new ConflictError(
                `Source "${conflict.name}" already provides dbt project "${name}" on this connection. Rename or rebind one source.`,
            );
    }

    async updatePeer(
        projectUuid: string,
        sourceUuid: string,
        data: UpdatePeerDbtSource,
    ): Promise<void> {
        const name =
            data.dbtProjectName === undefined || data.dbtProjectName === null
                ? data.dbtProjectName
                : normalizeDbtProjectName(data.dbtProjectName);
        if (name !== undefined && name !== null) {
            const error = validateDbtProjectName(name);
            if (error) throw new ParameterError(error);
        }
        if (
            data.membershipRole !== undefined &&
            !['publish', 'dependency_only'].includes(data.membershipRole)
        )
            throw new ParameterError('Invalid membership role');
        if (
            data.refreshPolicy !== undefined &&
            !['git_refresh', 'ci_managed'].includes(data.refreshPolicy)
        )
            throw new ParameterError('Invalid refresh policy');
        await this.args.database.transaction(async (trx) => {
            await trx('projects')
                .where('project_uuid', projectUuid)
                .forUpdate()
                .first();
            const source = await trx<DbPeerDbtSource>('project_dbt_sources')
                .where({
                    project_uuid: projectUuid,
                    project_dbt_source_uuid: sourceUuid,
                })
                .first();
            if (!source)
                throw new NotFoundError(
                    'Cannot find dbt source in this project',
                );
            await PeerDbtSourcesModel.assertUniqueName(
                trx,
                source,
                name ?? null,
            );
            await trx<DbPeerDbtSource>('project_dbt_sources')
                .where('project_dbt_source_uuid', sourceUuid)
                .update({
                    ...(name !== undefined
                        ? {
                              dbt_project_name: name,
                              dbt_project_name_conflict: null,
                          }
                        : {}),
                    ...(data.membershipRole !== undefined
                        ? { membership_role: data.membershipRole }
                        : {}),
                    ...(data.refreshPolicy !== undefined
                        ? { refresh_policy: data.refreshPolicy }
                        : {}),
                    updated_at: new Date(),
                });
            if (name !== undefined) {
                await trx.raw(
                    `
                    WITH candidates AS (
                        SELECT project_dbt_source_uuid,
                               COALESCE(dbt_project_name, dbt_project_name_conflict) AS candidate,
                               count(*) OVER (PARTITION BY COALESCE(dbt_project_name, dbt_project_name_conflict), warehouse_connection_uuid) AS providers
                        FROM project_dbt_sources WHERE project_uuid = ?
                    )
                    UPDATE project_dbt_sources AS source
                    SET dbt_project_name = candidates.candidate, dbt_project_name_conflict = NULL
                    FROM candidates
                    WHERE source.project_dbt_source_uuid = candidates.project_dbt_source_uuid
                      AND source.dbt_project_name_conflict IS NOT NULL AND candidates.providers = 1
                `,
                    [projectUuid],
                );
                if (source.dbt_repository_uuid) {
                    await trx.raw(
                        `
                        UPDATE dbt_repositories SET dbt_project_name = (
                            SELECT CASE WHEN count(DISTINCT COALESCE(dbt_project_name, dbt_project_name_conflict)) = 1
                                THEN min(COALESCE(dbt_project_name, dbt_project_name_conflict)) ELSE NULL END
                            FROM project_dbt_sources WHERE dbt_repository_uuid = ?
                        ), updated_at = now() WHERE dbt_repository_uuid = ?
                    `,
                        [
                            source.dbt_repository_uuid,
                            source.dbt_repository_uuid,
                        ],
                    );
                }
            }
        });
    }

    async learnProjectName(
        projectUuid: string,
        sourceUuid: string,
        name: string,
    ): Promise<void> {
        if (!(await this.isEnabled(projectUuid))) return;
        const source = await this.args
            .database('project_dbt_sources')
            .where({
                project_uuid: projectUuid,
                project_dbt_source_uuid: sourceUuid,
            })
            .first();
        if (!source) return;
        await this.updatePeer(projectUuid, sourceUuid, {
            dbtProjectName: name,
        });
    }

    async registerSource(
        projectUuid: string,
        sourceUuid: string,
        connection: DbtProjectConfig | null,
        options: { reportNameConflicts?: boolean } = {},
    ): Promise<void> {
        if (!(await this.isEnabled(projectUuid))) return;
        const identity = connection ? dbtRepositoryIdentity(connection) : null;
        await this.args.database.transaction(async (trx) => {
            await trx('projects')
                .where('project_uuid', projectUuid)
                .forUpdate()
                .first();
            const project = await trx('projects')
                .join(
                    'organizations',
                    'projects.organization_id',
                    'organizations.organization_id',
                )
                .select('organizations.organization_uuid')
                .where('projects.project_uuid', projectUuid)
                .first();
            if (!project) throw new NotFoundError('Cannot find project');
            const source = await trx<DbPeerDbtSource>('project_dbt_sources')
                .where({
                    project_uuid: projectUuid,
                    project_dbt_source_uuid: sourceUuid,
                })
                .first();
            if (!source) throw new NotFoundError('Cannot find dbt source');
            let repositoryUuid: string | null = null;
            let projectName = source.dbt_project_name;
            let projectNameConflict = source.dbt_project_name_conflict;
            if (identity) {
                if (!source.dbt_connection)
                    throw new ParameterError(
                        'A registered repository must have local credentials',
                    );
                if (
                    !PeerDbtSourcesModel.matchesRepository(
                        normalizeStoredDbtConnection(
                            JSON.parse(
                                this.args.encryptionUtil.decrypt(
                                    source.dbt_connection,
                                ),
                            ) as DbtProjectConfig,
                        ),
                        identity,
                    )
                )
                    throw new ParameterError(
                        'The source credentials do not match the registered repository',
                    );
                const [repository] = await trx<DbDbtRepository>(
                    'dbt_repositories',
                )
                    .insert({
                        organization_uuid: project.organization_uuid,
                        provider: identity.provider,
                        host: identity.host,
                        owner: identity.owner,
                        name: identity.name,
                        default_branch: identity.defaultBranch,
                        credential_source_uuid: sourceUuid,
                        created_by_project_uuid: projectUuid,
                    })
                    .onConflict([
                        'organization_uuid',
                        'provider',
                        'host',
                        'owner',
                        'name',
                    ])
                    .merge(['provider'])
                    .returning('*');
                repositoryUuid = repository.dbt_repository_uuid;
                const owner = repository.credential_source_uuid
                    ? await trx('project_dbt_sources')
                          .where(
                              'project_dbt_source_uuid',
                              repository.credential_source_uuid,
                          )
                          .whereNotNull('dbt_connection')
                          .first()
                    : await trx('projects')
                          .where(
                              'project_uuid',
                              repository.credential_project_uuid,
                          )
                          .whereNotNull('dbt_connection')
                          .first();
                if (!owner)
                    await trx<DbDbtRepository>('dbt_repositories')
                        .where('dbt_repository_uuid', repositoryUuid)
                        .update({
                            credential_source_uuid: sourceUuid,
                            credential_project_uuid: null,
                            created_by_project_uuid: projectUuid,
                            updated_at: new Date(),
                        });
                projectName ??= repository.dbt_project_name;
                try {
                    await PeerDbtSourcesModel.assertUniqueName(
                        trx,
                        source,
                        projectName,
                    );
                    if (projectName) projectNameConflict = null;
                } catch (error) {
                    if (
                        !options.reportNameConflicts ||
                        !(error instanceof ConflictError)
                    )
                        throw error;
                    projectNameConflict = projectName;
                    projectName = null;
                }
            }
            await trx<DbPeerDbtSource>('project_dbt_sources')
                .where({
                    project_uuid: projectUuid,
                    project_dbt_source_uuid: sourceUuid,
                })
                .update({
                    dbt_repository_uuid: repositoryUuid,
                    dbt_project_name: projectName,
                    dbt_project_name_conflict: projectNameConflict,
                });
            if (repositoryUuid && identity)
                await trx<DbDbtRepository>('dbt_repositories')
                    .where({
                        dbt_repository_uuid: repositoryUuid,
                        credential_source_uuid: sourceUuid,
                    })
                    .update({
                        default_branch: identity.defaultBranch,
                        updated_at: new Date(),
                    });
        });
    }

    async createSource(
        projectUuid: string,
        data: CreateProjectDbtSource,
    ): Promise<DbPeerDbtSource> {
        return this.args.database.transaction(async (trx) => {
            await trx('projects')
                .where('project_uuid', projectUuid)
                .forUpdate()
                .first();
            const project = await trx('projects')
                .join(
                    'organizations',
                    'projects.organization_id',
                    'organizations.organization_id',
                )
                .select('organizations.organization_uuid')
                .where('projects.project_uuid', projectUuid)
                .first();
            if (!project) throw new NotFoundError('Cannot find project');
            const identity = data.dbtConnection
                ? dbtRepositoryIdentity(data.dbtConnection)
                : null;
            const repository = identity
                ? await trx<DbDbtRepository>('dbt_repositories')
                      .where({
                          organization_uuid: project.organization_uuid,
                          provider: identity.provider,
                          host: identity.host,
                          owner: identity.owner,
                          name: identity.name,
                      })
                      .first()
                : null;
            const inputName =
                data.dbtProjectName !== undefined
                    ? data.dbtProjectName
                    : repository?.dbt_project_name;
            const name =
                inputName == null ? null : normalizeDbtProjectName(inputName);
            if (name !== null) {
                const error = validateDbtProjectName(name);
                if (error) throw new ParameterError(error);
            }
            const sourceUuid = randomUUID();
            const candidate = {
                project_uuid: projectUuid,
                project_dbt_source_uuid: sourceUuid,
                warehouse_connection_uuid: null,
            } as DbPeerDbtSource;
            await PeerDbtSourcesModel.assertUniqueName(trx, candidate, name);
            const [row] = await trx<DbPeerDbtSource>('project_dbt_sources')
                .insert({
                    project_dbt_source_uuid: sourceUuid,
                    project_uuid: projectUuid,
                    name: data.name,
                    is_primary: data.isPrimary,
                    precedence: data.precedence,
                    dbt_connection_type: data.dbtConnection?.type ?? null,
                    dbt_connection: data.dbtConnection
                        ? this.args.encryptionUtil.encrypt(
                              JSON.stringify(data.dbtConnection),
                          )
                        : null,
                    warehouse_database: data.warehouseLocation.database,
                    warehouse_schema: data.warehouseLocation.schema,
                    dbt_project_name: name,
                    refresh_policy:
                        data.dbtConnection &&
                        dbtRepositoryIdentity(data.dbtConnection)
                            ? 'git_refresh'
                            : 'ci_managed',
                })
                .returning('*');
            const transactionModel = new PeerDbtSourcesModel({
                ...this.args,
                database: trx,
            });
            await transactionModel.registerSource(
                projectUuid,
                sourceUuid,
                data.dbtConnection,
            );
            if (name !== null)
                await transactionModel.updatePeer(projectUuid, sourceUuid, {
                    dbtProjectName: name,
                });
            return row;
        });
    }

    async listShared(
        organizationUuid: string,
    ): Promise<DbtRepositorySummary[]> {
        const rows = await this.args
            .database<DbDbtRepository>('dbt_repositories')
            .where({ organization_uuid: organizationUuid, is_shared: true })
            .orderBy('owner')
            .orderBy('name');
        return rows.map(PeerDbtSourcesModel.repositorySummary);
    }

    async setShared(
        organizationUuid: string,
        projectUuid: string,
        repositoryUuid: string,
        isShared: boolean,
    ): Promise<void> {
        await this.args.database.transaction(async (trx) => {
            const repository = await trx<DbDbtRepository>('dbt_repositories')
                .where({
                    organization_uuid: organizationUuid,
                    dbt_repository_uuid: repositoryUuid,
                })
                .forUpdate()
                .first();
            if (
                !repository ||
                repository.created_by_project_uuid !== projectUuid
            )
                throw new ForbiddenError(
                    'Only an admin of the owning project can share this source',
                );
            if (!isShared) {
                const projects = await trx('project_dbt_sources')
                    .distinct('project_uuid')
                    .where('dbt_repository_uuid', repositoryUuid)
                    .whereNot('project_uuid', projectUuid);
                if (projects.length > 0)
                    throw new ConflictError(
                        `Cannot stop sharing this source: ${projects.length} other project${projects.length === 1 ? '' : 's'} use it. Remove the source from those projects first.`,
                    );
            }
            await trx<DbDbtRepository>('dbt_repositories')
                .where('dbt_repository_uuid', repositoryUuid)
                .update({ is_shared: isShared, updated_at: new Date() });
        });
    }

    async addShared(
        organizationUuid: string,
        projectUuid: string,
        data: AddSharedDbtSource,
    ): Promise<string> {
        return this.args.database.transaction(async (trx) => {
            await trx('projects')
                .where('project_uuid', projectUuid)
                .forUpdate()
                .first();
            const project = await trx('projects')
                .join(
                    'organizations',
                    'projects.organization_id',
                    'organizations.organization_id',
                )
                .select('organizations.organization_uuid')
                .where('projects.project_uuid', projectUuid)
                .first();
            if (project?.organization_uuid !== organizationUuid)
                throw new ForbiddenError(
                    'This project does not belong to the organization',
                );
            const repository = await trx<DbDbtRepository>('dbt_repositories')
                .where({
                    organization_uuid: organizationUuid,
                    dbt_repository_uuid: data.dbtRepositoryUuid,
                    is_shared: true,
                })
                .forUpdate()
                .first();
            if (!repository)
                throw new NotFoundError('Cannot find a shared dbt source');
            await new PeerDbtSourcesModel({
                ...this.args,
                database: trx,
            }).getRepositoryConnection(repository);
            if (data.warehouseConnectionUuid !== null) {
                const connection = await trx('warehouse_connections')
                    .where({
                        project_uuid: projectUuid,
                        warehouse_connection_uuid: data.warehouseConnectionUuid,
                    })
                    .first();
                if (!connection)
                    throw new ParameterError(
                        'The warehouse connection does not belong to this project',
                    );
                if (connection.is_original)
                    throw new ParameterError(
                        'Use the default connection without a warehouse connection UUID',
                    );
            }
            const existing = await trx<DbPeerDbtSource>(
                'project_dbt_sources',
            ).where('project_uuid', projectUuid);
            if (existing.some((source) => source.name === data.name))
                throw new ConflictError(
                    `A dbt source named "${data.name}" already exists on this project`,
                );
            const nameConflict = existing.find(
                (source) =>
                    source.dbt_project_name === repository.dbt_project_name &&
                    source.warehouse_connection_uuid ===
                        data.warehouseConnectionUuid,
            );
            if (repository.dbt_project_name && nameConflict)
                throw new ConflictError(
                    `Source "${nameConflict.name}" already provides dbt project "${repository.dbt_project_name}" on this connection. Rename or rebind one source.`,
                );
            const [created] = await trx<DbPeerDbtSource>('project_dbt_sources')
                .insert({
                    project_uuid: projectUuid,
                    name: data.name,
                    is_primary: false,
                    precedence:
                        Math.max(
                            0,
                            ...existing.map((source) => source.precedence),
                        ) + 1,
                    dbt_connection_type: repository.provider as DbtProjectType,
                    dbt_connection: null,
                    warehouse_database: null,
                    warehouse_schema: null,
                    warehouse_connection_uuid: data.warehouseConnectionUuid,
                    dbt_repository_uuid: repository.dbt_repository_uuid,
                    dbt_project_name: repository.dbt_project_name,
                    membership_role: data.membershipRole,
                    refresh_policy: data.refreshPolicy,
                })
                .returning('project_dbt_source_uuid');
            return created.project_dbt_source_uuid;
        });
    }

    async resolveConnection(
        projectUuid: string,
        repositoryUuid: string,
    ): Promise<DbtProjectConfig> {
        const project = await this.args
            .database('projects')
            .join(
                'organizations',
                'projects.organization_id',
                'organizations.organization_id',
            )
            .select('organizations.organization_uuid')
            .where('projects.project_uuid', projectUuid)
            .first();
        const repository = await this.args
            .database<DbDbtRepository>('dbt_repositories')
            .where({
                organization_uuid: project?.organization_uuid,
                dbt_repository_uuid: repositoryUuid,
            })
            .first();
        if (
            !repository ||
            (repository.created_by_project_uuid !== projectUuid &&
                !repository.is_shared)
        )
            throw new ForbiddenError(
                'This dbt repository is not shared with this project',
            );
        return this.getRepositoryConnection(repository);
    }

    private async getRepositoryConnection(
        repository: DbDbtRepository,
    ): Promise<DbtProjectConfig> {
        const credential = repository.credential_source_uuid
            ? await this.args
                  .database('project_dbt_sources')
                  .select('dbt_connection')
                  .where(
                      'project_dbt_source_uuid',
                      repository.credential_source_uuid,
                  )
                  .first()
            : await this.args
                  .database('projects')
                  .select('dbt_connection')
                  .where('project_uuid', repository.credential_project_uuid)
                  .first();
        if (!credential?.dbt_connection)
            throw new ParameterError(
                'The shared source owner must reconnect its repository',
            );
        try {
            const connection = normalizeStoredDbtConnection(
                JSON.parse(
                    this.args.encryptionUtil.decrypt(credential.dbt_connection),
                ) as DbtProjectConfig,
            );
            if (PeerDbtSourcesModel.matchesRepository(connection, repository))
                return connection;
        } catch {
            throw new ParameterError(
                'The shared source owner must reconnect the registered repository before it can be used',
            );
        }
        throw new ParameterError(
            'The shared source owner must reconnect the registered repository before it can be used',
        );
    }

    async isSharedConsumer(
        projectUuid: string,
        sourceUuid: string,
    ): Promise<boolean> {
        if (!(await this.isEnabled(projectUuid))) return false;
        const source = await this.args
            .database<DbPeerDbtSource>('project_dbt_sources')
            .where({
                project_uuid: projectUuid,
                project_dbt_source_uuid: sourceUuid,
            })
            .first();
        return !!source?.dbt_repository_uuid && source.dbt_connection === null;
    }

    async assertRepositoriesInProjectOrganization(
        projectUuid: string,
        repositoryUuids: string[],
    ): Promise<void> {
        if (repositoryUuids.length === 0) return;
        const project = await this.args
            .database('projects')
            .join(
                'organizations',
                'projects.organization_id',
                'organizations.organization_id',
            )
            .select('organizations.organization_uuid')
            .where('projects.project_uuid', projectUuid)
            .first();
        if (!project) throw new NotFoundError('Cannot find project');
        const foreign = await this.args
            .database<DbDbtRepository>('dbt_repositories')
            .whereIn('dbt_repository_uuid', repositoryUuids)
            .whereNot('organization_uuid', project.organization_uuid)
            .first();
        if (foreign)
            throw new ForbiddenError(
                'Cannot copy repository memberships to another organization',
            );
    }

    async assertRepositoriesCanBeCopied(
        projectUuid: string,
        sources: Pick<
            DbPeerDbtSource,
            'dbt_repository_uuid' | 'dbt_connection'
        >[],
    ): Promise<void> {
        const repositoryUuids = [
            ...new Set(
                sources.flatMap((source) =>
                    source.dbt_repository_uuid
                        ? [source.dbt_repository_uuid]
                        : [],
                ),
            ),
        ];
        if (repositoryUuids.length === 0) return;
        const project = await this.args
            .database('projects')
            .join(
                'organizations',
                'projects.organization_id',
                'organizations.organization_id',
            )
            .select('organizations.organization_uuid')
            .where('projects.project_uuid', projectUuid)
            .first();
        if (!project) throw new NotFoundError('Cannot find project');
        const repositories = await this.args
            .database<DbDbtRepository>('dbt_repositories')
            .whereIn('dbt_repository_uuid', repositoryUuids)
            .orderBy('dbt_repository_uuid')
            .forUpdate();
        if (repositories.length !== repositoryUuids.length)
            throw new NotFoundError('Cannot find a dbt repository to copy');
        await repositories.reduce(async (previous, repository) => {
            await previous;
            if (repository.organization_uuid !== project.organization_uuid)
                throw new ForbiddenError(
                    'Cannot copy repository memberships to another organization',
                );
            if (
                sources.some(
                    (source) =>
                        source.dbt_repository_uuid ===
                            repository.dbt_repository_uuid &&
                        source.dbt_connection === null,
                )
            ) {
                if (!repository.is_shared)
                    throw new NotFoundError(
                        'Cannot copy a repository that is no longer shared',
                    );
                await this.getRepositoryConnection(repository);
            }
        }, Promise.resolve());
    }

    async assertProjectCanBeDeleted(projectUuid: string): Promise<string[]> {
        await this.args
            .database('projects')
            .where('project_uuid', projectUuid)
            .forUpdate()
            .first();
        const sources = await this.args
            .database<DbPeerDbtSource>('project_dbt_sources')
            .where('project_uuid', projectUuid);
        const sourceUuids = new Set(
            sources.map((source) => source.project_dbt_source_uuid),
        );
        const repositories = await this.args
            .database<DbDbtRepository>('dbt_repositories')
            .where('credential_project_uuid', projectUuid)
            .orWhere('created_by_project_uuid', projectUuid)
            .orWhereIn('credential_source_uuid', [...sourceUuids])
            .orWhereIn(
                'dbt_repository_uuid',
                sources.flatMap((source) =>
                    source.dbt_repository_uuid
                        ? [source.dbt_repository_uuid]
                        : [],
                ),
            )
            .orderBy('dbt_repository_uuid')
            .forUpdate();
        const ownedRepositoryUuids = repositories
            .filter(
                (repository) =>
                    repository.credential_project_uuid === projectUuid ||
                    sourceUuids.has(repository.credential_source_uuid ?? '') ||
                    repository.created_by_project_uuid === projectUuid,
            )
            .map((repository) => repository.dbt_repository_uuid);
        if (ownedRepositoryUuids.length > 0) {
            const consumers = await this.args
                .database<DbPeerDbtSource>('project_dbt_sources')
                .distinct('project_uuid')
                .whereIn('dbt_repository_uuid', ownedRepositoryUuids)
                .whereNull('dbt_connection')
                .whereNot('project_uuid', projectUuid);
            if (consumers.length > 0)
                throw new ConflictError(
                    `Cannot delete this project: ${consumers.length} other project${consumers.length === 1 ? '' : 's'} use its shared repositories. Remove the sources from those projects first.`,
                );
        }
        return ownedRepositoryUuids;
    }

    async assertConnectionChange(
        projectUuid: string,
        sourceUuid: string,
        connection: DbtProjectConfig | null,
    ): Promise<void> {
        if (!(await this.isEnabled(projectUuid))) return;
        const repository = await this.args
            .database<DbDbtRepository>('dbt_repositories')
            .where('credential_source_uuid', sourceUuid)
            .first();
        if (!repository) return;
        if (
            !connection ||
            !PeerDbtSourcesModel.matchesRepository(connection, repository)
        )
            throw new ConflictError(
                'This source owns a registered repository. Add a new source to use a different repository.',
            );
    }

    async deleteSource(projectUuid: string, sourceUuid: string): Promise<void> {
        await this.args.database.transaction(async (trx) => {
            await trx('projects')
                .where('project_uuid', projectUuid)
                .forUpdate()
                .first();
            const repositories = await trx<DbDbtRepository>('dbt_repositories')
                .where('credential_source_uuid', sourceUuid)
                .orderBy('dbt_repository_uuid')
                .forUpdate();
            const repositoryUuids = repositories.map(
                (repository) => repository.dbt_repository_uuid,
            );
            if (repositoryUuids.length > 0) {
                const consumers = await trx<DbPeerDbtSource>(
                    'project_dbt_sources',
                )
                    .distinct('project_uuid')
                    .whereIn('dbt_repository_uuid', repositoryUuids)
                    .whereNull('dbt_connection')
                    .whereNot('project_dbt_source_uuid', sourceUuid);
                if (consumers.length > 0)
                    throw new ConflictError(
                        `Cannot remove this source: ${consumers.length} project${consumers.length === 1 ? '' : 's'} use its shared repository. Remove the source from those projects first.`,
                    );
                await trx<DbDbtRepository>('dbt_repositories')
                    .whereIn('dbt_repository_uuid', repositoryUuids)
                    .update({ is_shared: false });
            }
            await trx('project_dbt_sources')
                .where({
                    project_uuid: projectUuid,
                    project_dbt_source_uuid: sourceUuid,
                })
                .delete();
        });
    }
}
