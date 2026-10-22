import {
    ConflictError,
    NotFoundError,
    ParameterError,
} from '@lightdash/common';
import { type Knex } from 'knex';

export type PeerRepositoryOwnerRow = {
    created_by_project_uuid: string | null;
    credential_project_uuid: string | null;
    credential_source_uuid: string | null;
};

type DeletingProjectRow = {
    project_uuid: string;
    project_peer_deletion_started_at: Date | null;
};

export class PeerProjectDeletionModel {
    constructor(private readonly args: { database: Knex }) {}

    private static async lockProjects(
        trx: Knex.Transaction,
        projectUuids: string[],
    ): Promise<DeletingProjectRow[]> {
        await trx.raw("SET LOCAL lock_timeout = '2s'");
        return trx<DeletingProjectRow>('projects')
            .select('project_uuid', 'project_peer_deletion_started_at')
            .whereIn('project_uuid', projectUuids)
            .orderBy('project_uuid')
            .forUpdate();
    }

    private static async lockOwnedRepositories(
        trx: Knex.Transaction,
        projectUuids: string[],
    ): Promise<string[]> {
        const ownedSourceUuids = trx('project_dbt_sources')
            .select('project_dbt_source_uuid')
            .where('role', 'extra')
            .whereIn('project_uuid', projectUuids);
        await trx.raw("SET LOCAL lock_timeout = '2s'");
        const repositories = await trx<{ dbt_repository_uuid: string }>(
            'dbt_repositories',
        )
            .select('dbt_repository_uuid')
            .whereIn('created_by_project_uuid', projectUuids)
            .orWhereIn('credential_project_uuid', projectUuids)
            .orWhereIn('credential_source_uuid', ownedSourceUuids)
            .orderBy('dbt_repository_uuid')
            .forUpdate();
        return repositories.map((repository) => repository.dbt_repository_uuid);
    }

    private static async assertNoExternalConsumers(
        trx: Knex.Transaction,
        repositoryUuids: string[],
        deletingProjectUuids: string[],
    ): Promise<void> {
        if (repositoryUuids.length === 0) return;
        const consumers = await trx('project_dbt_sources')
            .distinct('project_uuid')
            .where('role', 'extra')
            .whereIn('dbt_repository_uuid', repositoryUuids)
            .whereNull('dbt_connection')
            .whereNotIn('project_uuid', deletingProjectUuids);
        if (consumers.length > 0)
            throw new ConflictError(
                `Cannot delete this project: ${consumers.length} other project${consumers.length === 1 ? '' : 's'} use its shared repositories. Remove the sources from those projects first.`,
            );
    }

    async begin(projectUuids: string[]): Promise<void> {
        if (this.args.database.isTransaction)
            throw new ParameterError(
                'Begin peer project deletion outside a content transaction',
            );
        const sortedProjectUuids = [...new Set(projectUuids)].sort();
        if (sortedProjectUuids.length === 0) return;
        await this.args.database.transaction(async (trx) => {
            const projects = await PeerProjectDeletionModel.lockProjects(
                trx,
                sortedProjectUuids,
            );
            if (projects.length !== sortedProjectUuids.length)
                throw new NotFoundError('Cannot find a project to delete');
            const repositories =
                await PeerProjectDeletionModel.lockOwnedRepositories(
                    trx,
                    sortedProjectUuids,
                );
            await PeerProjectDeletionModel.assertNoExternalConsumers(
                trx,
                repositories,
                sortedProjectUuids,
            );
            await trx.raw("SET LOCAL lock_timeout = '2s'");
            await trx<DeletingProjectRow>('projects')
                .whereIn('project_uuid', sortedProjectUuids)
                .whereNull('project_peer_deletion_started_at')
                .update({ project_peer_deletion_started_at: trx.fn.now() });
        });
    }

    async withFinalDeletion<T>(
        projectUuid: string,
        deleteProject: (trx: Knex.Transaction) => Promise<T>,
        transaction?: Knex.Transaction,
        deletingProjectUuids: string[] = [projectUuid],
    ): Promise<T> {
        if (this.args.database.isTransaction && !transaction)
            throw new ParameterError(
                'Pass the short final transaction explicitly for peer project deletion',
            );
        const sortedProjectUuids = [
            ...new Set([...deletingProjectUuids, projectUuid]),
        ].sort();
        const finalize = async (trx: Knex.Transaction): Promise<T> => {
            const projects = await PeerProjectDeletionModel.lockProjects(
                trx,
                sortedProjectUuids,
            );
            const project = projects.find(
                (row) => row.project_uuid === projectUuid,
            );
            if (!project) throw new NotFoundError('Cannot find project');
            if (
                projects.some(
                    (row) => row.project_peer_deletion_started_at === null,
                )
            )
                throw new ConflictError(
                    'Begin deletion for every project in the deletion group first',
                );
            const repositories =
                await PeerProjectDeletionModel.lockOwnedRepositories(
                    trx,
                    sortedProjectUuids,
                );
            await PeerProjectDeletionModel.assertNoExternalConsumers(
                trx,
                repositories,
                sortedProjectUuids,
            );
            if (repositories.length > 0) {
                await trx.raw("SET LOCAL lock_timeout = '2s'");
                await trx('dbt_repositories')
                    .whereIn('dbt_repository_uuid', repositories)
                    .update({ is_shared: false, updated_at: trx.fn.now() });
            }
            await trx.raw("SET LOCAL lock_timeout = '2s'");
            return deleteProject(trx);
        };
        return transaction
            ? finalize(transaction)
            : this.args.database.transaction(finalize);
    }

    static async assertRepositoryOwnersAvailable(
        trx: Knex,
        repositoryRows: readonly PeerRepositoryOwnerRow[],
    ): Promise<void> {
        if (repositoryRows.length === 0) return;
        const projectUuids = [
            ...new Set(
                repositoryRows.flatMap((repository) =>
                    [
                        repository.created_by_project_uuid,
                        repository.credential_project_uuid,
                    ].filter((uuid): uuid is string => uuid !== null),
                ),
            ),
        ];
        const credentialSourceUuids = repositoryRows.flatMap((repository) =>
            repository.credential_source_uuid === null
                ? []
                : [repository.credential_source_uuid],
        );
        const credentialProjects = trx('project_dbt_sources')
            .select('project_uuid')
            .where('role', 'extra')
            .whereIn('project_dbt_source_uuid', credentialSourceUuids);
        const deletingOwner = await trx('projects')
            .whereNotNull('project_peer_deletion_started_at')
            .where((query) =>
                query
                    .whereIn('project_uuid', projectUuids)
                    .orWhereIn('project_uuid', credentialProjects),
            )
            .first('project_uuid');
        if (deletingOwner)
            throw new ConflictError(
                'Cannot use this shared repository while its owning project is being deleted. Retry after the deletion is resolved.',
            );
    }
}
