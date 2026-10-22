import {
    ConflictError,
    DbtProjectType,
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
import { DatabaseError } from 'pg';
import { type DbProjectDbtSource } from '../database/entities/projectDbtSources';
import Logger from '../logging/logger';
import { type EncryptionUtil } from '../utils/EncryptionUtil/EncryptionUtil';
import { getPeerDbtSourcesEnabled } from '../utils/peerDbtSourcesOperation';
import { dbtRepositoryIdentity } from './dbtRepositoryIdentity';
import { PeerProjectDeletionModel } from './PeerProjectDeletionModel';
import { normalizeStoredDbtConnection } from './ProjectModel/normalizeStoredDbtConnection';

export type DbPeerDbtSource = DbProjectDbtSource & {
    dbt_repository_uuid: string | null;
    dbt_project_name: string | null;
    dbt_project_name_conflict: string | null;
    warehouse_connection_uuid: string | null;
    membership_role: 'publish' | 'dependency_only';
    refresh_policy: 'git_refresh' | 'ci_managed';
    repository_fill_state:
        | 'pending'
        | 'registered'
        | 'not_git'
        | 'cannot_decrypt'
        | 'cannot_parse'
        | 'failed';
    repository_fill_attempted_at: Date | null;
    dbt_project_name_initialized_at: Date | null;
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
            peerDbtSourcesEnabled?: boolean;
        },
    ) {}

    private get enabled(): boolean {
        return this.args.peerDbtSourcesEnabled ?? getPeerDbtSourcesEnabled();
    }

    async isEnabled(_projectUuid: string): Promise<boolean> {
        return this.enabled;
    }

    private static async lockProject(trx: Knex, projectUuid: string) {
        await trx.raw("SET LOCAL lock_timeout = '2s'");
        const project = await trx('projects')
            .where('project_uuid', projectUuid)
            .forUpdate()
            .first();
        if (!project) throw new NotFoundError('Cannot find project');
        const organization = await trx('organizations')
            .select('organization_uuid')
            .where('organization_id', project.organization_id)
            .first();
        if (!organization) throw new NotFoundError('Cannot find organization');
        return organization.organization_uuid as string;
    }

    private static logFill(
        projectUuid: string,
        sourceUuid: string | null,
        outcome: DbPeerDbtSource['repository_fill_state'],
        stateRecorded = true,
    ): void {
        Logger.info('peer_dbt_source_repository_fill', {
            projectUuid,
            sourceUuid,
            outcome,
            stateRecorded,
        });
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

    async ensureRepositories(
        projectUuid: string,
        options: { retry?: boolean } = {},
    ): Promise<void> {
        if (!this.enabled) return;
        try {
            await this.initializeProjectNames(projectUuid);
        } catch {
            PeerDbtSourcesModel.logFill(projectUuid, null, 'failed', false);
        }
        try {
            const rows: Pick<DbPeerDbtSource, 'project_dbt_source_uuid'>[] =
                await this.args
                    .database<DbPeerDbtSource>('project_dbt_sources')
                    .select('project_dbt_source_uuid')
                    .where({ project_uuid: projectUuid, role: 'extra' })
                    .modify((query) => {
                        if (options.retry)
                            query.whereNotIn('repository_fill_state', [
                                'not_git',
                                'cannot_parse',
                            ]);
                        else query.where('repository_fill_state', 'pending');
                    })
                    .orderBy('project_dbt_source_uuid');
            const counts: Partial<
                Record<DbPeerDbtSource['repository_fill_state'], number>
            > = {};
            let unrecordedFailures = 0;
            await rows.reduce(async (previous, row) => {
                await previous;
                const outcome = await this.fillSource(
                    projectUuid,
                    row.project_dbt_source_uuid,
                    {
                        retry: options.retry ?? false,
                        reportNameConflicts: true,
                        throwOnFailure: false,
                    },
                );
                if (outcome) {
                    counts[outcome.state] = (counts[outcome.state] ?? 0) + 1;
                    if (!outcome.recorded) unrecordedFailures += 1;
                }
            }, Promise.resolve());
            Logger.info('peer_dbt_source_repository_fill_summary', {
                projectUuid,
                counts,
                unrecordedFailures,
            });
        } catch {
            PeerDbtSourcesModel.logFill(projectUuid, null, 'failed', false);
        }
    }

    async initializeProjectNames(projectUuid: string): Promise<void> {
        if (!this.enabled) return;
        await this.args.database.transaction(async (trx) => {
            await PeerDbtSourcesModel.lockProject(trx, projectUuid);
            await PeerDbtSourcesModel.initializeProjectNamesInTransaction(
                trx,
                projectUuid,
            );
        });
    }

    private static async initializeProjectNamesInTransaction(
        trx: Knex,
        projectUuid: string,
    ): Promise<void> {
        const rows = await trx<DbPeerDbtSource>('project_dbt_sources')
            .where({ project_uuid: projectUuid, role: 'extra' })
            .orderBy('project_dbt_source_uuid');
        if (rows.every((row) => row.dbt_project_name_initialized_at !== null))
            return;
        const evidence = await trx.raw<{
            rows: { source_uuid: string | null; project_name: string | null }[];
        }>(
            `SELECT dbt_source_uuid::text AS source_uuid, project_name
             FROM dbt_source_ref_catalogs WHERE project_uuid = ?
             UNION
             SELECT COALESCE(explore->'tables'->COALESCE(explore->>'baseTable', name)->>'dbtSourceUuid', explore->>'dbtSourceUuid'),
                    explore->'tables'->COALESCE(explore->>'baseTable', name)->>'dbtPackageName'
             FROM cached_explore WHERE project_uuid = ?
               AND COALESCE(explore->>'type', '') NOT IN ('virtual', 'external_source')`,
            [projectUuid, projectUuid],
        );
        const candidates = new Map<string, Set<string>>();
        evidence.rows.forEach((row) => {
            if (!row.source_uuid || !row.project_name) return;
            const name = normalizeDbtProjectName(row.project_name);
            if (validateDbtProjectName(name)) return;
            const names = candidates.get(row.source_uuid) ?? new Set<string>();
            names.add(name);
            candidates.set(row.source_uuid, names);
        });
        const names = new Map<string, string | null>(
            rows.map((row) => {
                const stored =
                    row.dbt_project_name ?? row.dbt_project_name_conflict;
                const values = candidates.get(row.project_dbt_source_uuid);
                return [
                    row.project_dbt_source_uuid,
                    stored ??
                        (row.dbt_project_name_initialized_at === null &&
                        values?.size === 1
                            ? [...values][0]
                            : null),
                ];
            }),
        );
        await PeerDbtSourcesModel.assignProjectNames(
            trx,
            projectUuid,
            rows,
            names,
        );
    }

    private static async assignProjectNames(
        trx: Knex,
        projectUuid: string,
        rows: DbPeerDbtSource[],
        names: Map<string, string | null>,
    ): Promise<void> {
        const counts = new Map<string, number>();
        const group = (row: DbPeerDbtSource, name: string) =>
            JSON.stringify([row.warehouse_connection_uuid, name]);
        for (const row of rows) {
            const name = names.get(row.project_dbt_source_uuid);
            if (name)
                counts.set(
                    group(row, name),
                    (counts.get(group(row, name)) ?? 0) + 1,
                );
        }
        await trx<DbPeerDbtSource>('project_dbt_sources')
            .where({ project_uuid: projectUuid, role: 'extra' })
            .update({ dbt_project_name: null });
        const duplicateSourceUuids = rows
            .filter((row) => {
                const name = names.get(row.project_dbt_source_uuid);
                return name && (counts.get(group(row, name)) ?? 0) > 1;
            })
            .map((row) => row.project_dbt_source_uuid);
        if (duplicateSourceUuids.length)
            Logger.warn('peer_dbt_source_project_name_conflicts', {
                projectUuid,
                count: duplicateSourceUuids.length,
                sourceUuids: duplicateSourceUuids,
            });
        await rows.reduce(async (previous, row) => {
            await previous;
            const name = names.get(row.project_dbt_source_uuid) ?? null;
            const conflict =
                name !== null && (counts.get(group(row, name)) ?? 0) > 1;
            await trx<DbPeerDbtSource>('project_dbt_sources')
                .where({
                    project_dbt_source_uuid: row.project_dbt_source_uuid,
                    role: 'extra',
                })
                .update({
                    dbt_project_name: conflict ? null : name,
                    dbt_project_name_conflict: conflict ? name : null,
                    dbt_project_name_initialized_at:
                        row.dbt_project_name_initialized_at ?? new Date(),
                });
        }, Promise.resolve());
    }

    async getSettings(
        projectUuid: string,
    ): Promise<Map<string, PeerDbtSourceSettings>> {
        await this.ensureRepositories(projectUuid);
        const rows = await this.args
            .database<DbPeerDbtSource>('project_dbt_sources')
            .where('role', 'extra')
            .where('project_uuid', projectUuid);
        const repositories = await this.args
            .database<DbDbtRepository>('dbt_repositories')
            .where(
                'organization_uuid',
                this.args
                    .database('projects')
                    .join(
                        'organizations',
                        'projects.organization_id',
                        'organizations.organization_id',
                    )
                    .select('organizations.organization_uuid')
                    .where('projects.project_uuid', projectUuid),
            )
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
                    dbtProjectNameState:
                        PeerDbtSourcesModel.projectNameState(row),
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

    private static projectNameState(
        source: DbPeerDbtSource,
    ): PeerDbtSourceSettings['dbtProjectNameState'] {
        if (source.dbt_project_name_conflict) return 'conflict';
        if (source.dbt_project_name) return 'known';
        return 'unknown';
    }

    private static async assertUniqueName(
        trx: Knex,
        source: DbPeerDbtSource,
        name: string | null,
    ): Promise<void> {
        if (!name) return;
        const conflict = await trx<DbPeerDbtSource>('project_dbt_sources')
            .where('role', 'extra')
            .where('project_uuid', source.project_uuid)
            .where((query) =>
                query
                    .where('dbt_project_name', name)
                    .orWhere('dbt_project_name_conflict', name),
            )
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

    static async assertBindingIsUnique(
        trx: Knex,
        projectUuid: string,
        sourceUuid: string,
        warehouseConnectionUuid: string | null,
    ): Promise<void> {
        await PeerDbtSourcesModel.initializeProjectNamesInTransaction(
            trx,
            projectUuid,
        );
        const source = await trx<DbPeerDbtSource>('project_dbt_sources')
            .where({
                project_uuid: projectUuid,
                project_dbt_source_uuid: sourceUuid,
                role: 'extra',
            })
            .first();
        if (!source)
            throw new NotFoundError('Cannot find dbt source in this project');
        await PeerDbtSourcesModel.assertUniqueName(
            trx,
            { ...source, warehouse_connection_uuid: warehouseConnectionUuid },
            source.dbt_project_name ?? source.dbt_project_name_conflict,
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
            await PeerDbtSourcesModel.lockProject(trx, projectUuid);
            await PeerDbtSourcesModel.initializeProjectNamesInTransaction(
                trx,
                projectUuid,
            );
            const source = await trx<DbPeerDbtSource>('project_dbt_sources')
                .where('role', 'extra')
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
                .where('role', 'extra')
                .where('project_dbt_source_uuid', sourceUuid)
                .update({
                    ...(name !== undefined
                        ? {
                              dbt_project_name: name,
                              dbt_project_name_conflict: null,
                              dbt_project_name_initialized_at: new Date(),
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
                        FROM project_dbt_sources WHERE project_uuid = ? AND role = 'extra'
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
                            FROM project_dbt_sources WHERE dbt_repository_uuid = ? AND role = 'extra'
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
        if (!this.enabled) return;
        try {
            const source = await this.args
                .database('project_dbt_sources')
                .where('role', 'extra')
                .where({
                    project_uuid: projectUuid,
                    project_dbt_source_uuid: sourceUuid,
                })
                .first();
            if (!source) return;
            await this.updatePeer(projectUuid, sourceUuid, {
                dbtProjectName: name,
            });
        } catch (error) {
            if (
                !(
                    error instanceof Error && error.name === 'KnexTimeoutError'
                ) &&
                !(
                    error instanceof DatabaseError &&
                    (['55P03', '40P01', '40001', '57014'].includes(
                        error.code ?? '',
                    ) ||
                        ['08', '53', '58'].some((prefix) =>
                            error.code?.startsWith(prefix),
                        ) ||
                        ['57P01', '57P02', '57P03'].includes(error.code ?? ''))
                )
            )
                throw error;
            Logger.info('peer_dbt_source_project_name_learning', {
                projectUuid,
                sourceUuid,
                outcome: 'metadata_unavailable',
            });
        }
    }

    async registerSource(
        projectUuid: string,
        sourceUuid: string,
        _connection: DbtProjectConfig | null,
        options: { reportNameConflicts?: boolean } = {},
    ): Promise<void> {
        if (!this.enabled) return;
        await this.fillSource(projectUuid, sourceUuid, {
            retry: true,
            reportNameConflicts: options.reportNameConflicts ?? false,
            throwOnFailure: true,
        });
    }

    private async fillSource(
        projectUuid: string,
        sourceUuid: string,
        options: {
            retry: boolean;
            reportNameConflicts: boolean;
            throwOnFailure: boolean;
        },
    ): Promise<{
        state: DbPeerDbtSource['repository_fill_state'];
        recorded: boolean;
    } | null> {
        let observed: Pick<DbPeerDbtSource, 'dbt_connection'> | null = null;

        try {
            observed =
                (await this.args
                    .database<DbPeerDbtSource>('project_dbt_sources')
                    .select('dbt_connection')
                    .where({
                        project_uuid: projectUuid,
                        project_dbt_source_uuid: sourceUuid,
                        role: 'extra',
                    })
                    .first()) ?? null;
            const outcome = await this.args.database.transaction(
                async (trx) => {
                    const organizationUuid =
                        await PeerDbtSourcesModel.lockProject(trx, projectUuid);
                    const source = await trx<DbPeerDbtSource>(
                        'project_dbt_sources',
                    )
                        .where({
                            project_uuid: projectUuid,
                            project_dbt_source_uuid: sourceUuid,
                            role: 'extra',
                        })
                        .forUpdate()
                        .first();
                    if (!source) return null;
                    observed = source;
                    if (
                        !options.throwOnFailure &&
                        ['not_git', 'cannot_parse'].includes(
                            source.repository_fill_state,
                        )
                    )
                        return null;
                    if (
                        !options.retry &&
                        source.repository_fill_state !== 'pending'
                    )
                        return null;
                    let state: DbPeerDbtSource['repository_fill_state'];
                    try {
                        state = await trx.transaction(async (savepoint) => {
                            await PeerDbtSourcesModel.initializeProjectNamesInTransaction(
                                savepoint,
                                projectUuid,
                            );
                            if (!source.dbt_connection) {
                                return source.dbt_repository_uuid
                                    ? 'registered'
                                    : 'not_git';
                            }
                            let plaintext: string;
                            try {
                                plaintext = this.args.encryptionUtil.decrypt(
                                    source.dbt_connection,
                                );
                            } catch {
                                return 'cannot_decrypt';
                            }
                            let connection: DbtProjectConfig;
                            let identity: ReturnType<
                                typeof dbtRepositoryIdentity
                            >;
                            try {
                                connection = normalizeStoredDbtConnection(
                                    JSON.parse(plaintext) as DbtProjectConfig,
                                );
                                if (
                                    !Object.values(DbtProjectType).includes(
                                        connection.type,
                                    )
                                )
                                    return 'cannot_parse';
                                identity = dbtRepositoryIdentity(connection);
                            } catch {
                                return 'cannot_parse';
                            }
                            const git = [
                                DbtProjectType.GITHUB,
                                DbtProjectType.GITLAB,
                                DbtProjectType.BITBUCKET,
                                DbtProjectType.AZURE_DEVOPS,
                            ].includes(connection.type);
                            if (!git) {
                                await savepoint<DbPeerDbtSource>(
                                    'project_dbt_sources',
                                )
                                    .where({
                                        project_dbt_source_uuid: sourceUuid,
                                        role: 'extra',
                                    })
                                    .update({ dbt_repository_uuid: null });
                                return 'not_git';
                            }
                            if (!identity) return 'cannot_parse';
                            await this.registerRepository(
                                savepoint,
                                organizationUuid,
                                projectUuid,
                                sourceUuid,
                                identity,
                                options.reportNameConflicts,
                            );
                            return 'registered';
                        });
                    } catch (error) {
                        if (options.throwOnFailure) throw error;
                        state = 'failed';
                    }
                    await trx<DbPeerDbtSource>('project_dbt_sources')
                        .where({
                            project_dbt_source_uuid: sourceUuid,
                            role: 'extra',
                        })
                        .update({
                            repository_fill_state: state,
                            repository_fill_attempted_at: new Date(),
                        });
                    return state;
                },
            );
            if (!outcome) return null;
            PeerDbtSourcesModel.logFill(projectUuid, sourceUuid, outcome);
            return { state: outcome, recorded: true };
        } catch (error) {
            if (options.throwOnFailure) {
                PeerDbtSourcesModel.logFill(
                    projectUuid,
                    sourceUuid,
                    'failed',
                    false,
                );
                throw error;
            }
            const recorded =
                observed !== null &&
                (await this.recordFillFailure(
                    projectUuid,
                    sourceUuid,
                    observed.dbt_connection,
                ));
            PeerDbtSourcesModel.logFill(
                projectUuid,
                sourceUuid,
                'failed',
                recorded,
            );
            return { state: 'failed', recorded };
        }
    }

    private async recordFillFailure(
        projectUuid: string,
        sourceUuid: string,
        ciphertext: Buffer | null,
    ): Promise<boolean> {
        try {
            return await this.args.database.transaction(async (trx) => {
                await trx.raw("SET LOCAL lock_timeout = '250ms'");
                const updated = await trx<DbPeerDbtSource>(
                    'project_dbt_sources',
                )
                    .where({
                        project_uuid: projectUuid,
                        project_dbt_source_uuid: sourceUuid,
                        role: 'extra',
                        repository_fill_state: 'pending',
                    })
                    .whereRaw('dbt_connection IS NOT DISTINCT FROM ?::bytea', [
                        ciphertext,
                    ])
                    .update({
                        repository_fill_state: 'failed',
                        repository_fill_attempted_at: new Date(),
                    });
                return updated > 0;
            });
        } catch {
            return false;
        }
    }

    private async registerRepository(
        trx: Knex,
        organizationUuid: string,
        projectUuid: string,
        sourceUuid: string,
        identity: NonNullable<ReturnType<typeof dbtRepositoryIdentity>>,
        reportNameConflicts: boolean,
    ): Promise<void> {
        const coordinates = {
            organization_uuid: organizationUuid,
            provider: identity.provider,
            host: identity.host,
            owner: identity.owner,
            name: identity.name,
        };
        await trx<DbDbtRepository>('dbt_repositories')
            .insert({
                ...coordinates,
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
            .ignore();
        const repository = await trx<DbDbtRepository>('dbt_repositories')
            .where(coordinates)
            .forUpdate()
            .first();
        if (!repository)
            throw new NotFoundError('Cannot find registered repository');
        await this.assertCredentialOrganization(trx, repository);
        const source = await trx<DbPeerDbtSource>('project_dbt_sources')
            .where({
                project_dbt_source_uuid: sourceUuid,
                project_uuid: projectUuid,
                role: 'extra',
            })
            .first();
        if (!source) throw new NotFoundError('Cannot find dbt source');
        const scopedName =
            source.dbt_project_name ?? source.dbt_project_name_conflict;
        const projectName = reportNameConflicts
            ? scopedName
            : (scopedName ?? repository.dbt_project_name);
        if (!reportNameConflicts)
            await PeerDbtSourcesModel.assertUniqueName(
                trx,
                source,
                projectName,
            );
        await trx<DbPeerDbtSource>('project_dbt_sources')
            .where({ project_dbt_source_uuid: sourceUuid, role: 'extra' })
            .update({ dbt_repository_uuid: repository.dbt_repository_uuid });
        if (!reportNameConflicts) {
            await trx<DbPeerDbtSource>('project_dbt_sources')
                .where({ project_dbt_source_uuid: sourceUuid, role: 'extra' })
                .update({
                    dbt_project_name: projectName,
                    dbt_project_name_conflict: null,
                });
        }
        await trx.raw(
            `UPDATE dbt_repositories SET dbt_project_name = (
                SELECT CASE WHEN count(DISTINCT COALESCE(dbt_project_name, dbt_project_name_conflict)) = 0
                    THEN dbt_repositories.dbt_project_name
                    WHEN count(DISTINCT COALESCE(dbt_project_name, dbt_project_name_conflict)) = 1
                    THEN min(COALESCE(dbt_project_name, dbt_project_name_conflict)) ELSE NULL END
                FROM project_dbt_sources WHERE dbt_repository_uuid = ? AND role = 'extra'
            ) WHERE dbt_repository_uuid = ?`,
            [repository.dbt_repository_uuid, repository.dbt_repository_uuid],
        );
        if (repository.credential_source_uuid === sourceUuid) {
            await trx<DbDbtRepository>('dbt_repositories')
                .where('dbt_repository_uuid', repository.dbt_repository_uuid)
                .update({
                    default_branch: identity.defaultBranch,
                    updated_at: new Date(),
                });
        }
    }

    private async assertCredentialOrganization(
        trx: Knex,
        repository: DbDbtRepository,
    ): Promise<void> {
        if (
            !repository.credential_source_uuid &&
            !repository.credential_project_uuid
        )
            return;
        const credentialProject = trx('projects')
            .join(
                'organizations',
                'organizations.organization_id',
                'projects.organization_id',
            )
            .select('organizations.organization_uuid');
        if (repository.credential_source_uuid) {
            credentialProject
                .join(
                    'project_dbt_sources',
                    'projects.project_uuid',
                    'project_dbt_sources.project_uuid',
                )
                .where(
                    'project_dbt_sources.project_dbt_source_uuid',
                    repository.credential_source_uuid,
                )
                .where('project_dbt_sources.role', 'extra');
        } else {
            credentialProject.where(
                'projects.project_uuid',
                repository.credential_project_uuid,
            );
        }
        const credential = await credentialProject.first();
        if (credential?.organization_uuid !== repository.organization_uuid)
            throw new ForbiddenError(
                'The repository credentials do not belong to this organization',
            );
    }

    async createSource(
        projectUuid: string,
        data: CreateProjectDbtSource,
    ): Promise<DbPeerDbtSource> {
        return this.args.database.transaction(async (trx) => {
            await PeerDbtSourcesModel.lockProject(trx, projectUuid);
            await PeerDbtSourcesModel.initializeProjectNamesInTransaction(
                trx,
                projectUuid,
            );
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
                    dbt_project_name_initialized_at: new Date(),
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
            await PeerDbtSourcesModel.lockProject(trx, projectUuid);
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
            if (this.enabled)
                await PeerProjectDeletionModel.assertRepositoryOwnersAvailable(
                    trx,
                    [repository],
                );
            await this.assertCredentialOrganization(trx, repository);
            if (!isShared) {
                const projects = await trx('project_dbt_sources')
                    .where('role', 'extra')
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
            await PeerDbtSourcesModel.lockProject(trx, projectUuid);
            await PeerDbtSourcesModel.initializeProjectNamesInTransaction(
                trx,
                projectUuid,
            );
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
            if (this.enabled)
                await PeerProjectDeletionModel.assertRepositoryOwnersAvailable(
                    trx,
                    [repository],
                );
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
            ).where({ project_uuid: projectUuid, role: 'extra' });
            if (existing.some((source) => source.name === data.name))
                throw new ConflictError(
                    `A dbt source named "${data.name}" already exists on this project`,
                );
            const nameConflict = existing.find(
                (source) =>
                    (source.dbt_project_name ??
                        source.dbt_project_name_conflict) ===
                        repository.dbt_project_name &&
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
                    dbt_project_name_initialized_at: new Date(),
                    repository_fill_state: 'registered',
                    repository_fill_attempted_at: new Date(),
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
        await this.assertCredentialOrganization(this.args.database, repository);
        const credential = repository.credential_source_uuid
            ? await this.args
                  .database('project_dbt_sources')
                  .where('role', 'extra')
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
        if (!this.enabled) return false;
        const source = await this.args
            .database<DbPeerDbtSource>('project_dbt_sources')
            .where('role', 'extra')
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
        if (this.enabled)
            await PeerProjectDeletionModel.assertRepositoryOwnersAvailable(
                this.args.database,
                repositories,
            );
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

    async assertConnectionChange(
        projectUuid: string,
        sourceUuid: string,
        connection: DbtProjectConfig | null,
    ): Promise<void> {
        if (!this.enabled) return;
        const source = await this.args
            .database<DbPeerDbtSource>('project_dbt_sources')
            .where({
                project_uuid: projectUuid,
                project_dbt_source_uuid: sourceUuid,
                role: 'extra',
            })
            .first();
        if (!source) throw new NotFoundError('Cannot find dbt source');
        const repositories = await this.args
            .database<DbDbtRepository>('dbt_repositories')
            .where('credential_source_uuid', sourceUuid)
            .orderBy('dbt_repository_uuid')
            .forUpdate();
        await repositories.reduce(async (previous, repository) => {
            await previous;
            if (
                connection &&
                PeerDbtSourcesModel.matchesRepository(connection, repository)
            )
                return;
            const consumer = await this.args
                .database<DbPeerDbtSource>('project_dbt_sources')
                .where({
                    dbt_repository_uuid: repository.dbt_repository_uuid,
                    role: 'extra',
                })
                .whereNull('dbt_connection')
                .first();
            if (repository.is_shared || consumer)
                throw new ConflictError(
                    'This source owns a shared repository. Add a new source to use a different repository.',
                );
        }, Promise.resolve());
    }

    async deleteSource(projectUuid: string, sourceUuid: string): Promise<void> {
        await this.args.database.transaction(async (trx) => {
            await PeerDbtSourcesModel.lockProject(trx, projectUuid);
            const source = await trx<DbPeerDbtSource>('project_dbt_sources')
                .where({
                    project_uuid: projectUuid,
                    project_dbt_source_uuid: sourceUuid,
                    role: 'extra',
                })
                .first();
            if (!source) throw new NotFoundError('Cannot find dbt source');
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
                    .where('role', 'extra')
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
                .where('role', 'extra')
                .where({
                    project_uuid: projectUuid,
                    project_dbt_source_uuid: sourceUuid,
                })
                .delete();
        });
    }
}
