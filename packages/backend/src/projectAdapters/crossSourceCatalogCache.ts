import { getErrorMessage, type DbtExternalModelNode } from '@lightdash/common';
import { type Knex } from 'knex';
import Logger from '../logging/logger';
import { type DbtSourceRefCatalogModel } from '../models/DbtSourceRefCatalogModel';
import { type CrossSourceCatalog } from './crossSourceRefs';

export const logCrossSourceCacheError = (error: unknown) =>
    Logger.warn('dbt.compile.crossSourceCacheError', {
        event: 'dbt.compile.crossSourceCacheError',
        message: getErrorMessage(error),
        code: error instanceof Error && 'code' in error ? error.code : null,
    });

export class CrossSourceCatalogCache {
    rowsLoaded = 0;

    rowsWritten = 0;

    private readonly entries = new Map<string, string>();

    private readonly pending = new Map<
        string,
        Parameters<DbtSourceRefCatalogModel['upsertProvisional']>[0]
    >();

    constructor(
        private readonly model: DbtSourceRefCatalogModel,
        private readonly projectUuid: string,
        private readonly connectionGroup: string,
        private readonly dbtVersion: string,
        private readonly compileJobUuid: string | null,
        private readonly deferWrites = false,
    ) {}

    async load(
        sources: { key: string; uuid: string }[],
    ): Promise<CrossSourceCatalog[]> {
        try {
            const rows = await this.model.get(
                this.projectUuid,
                this.connectionGroup,
            );
            const matched = rows.flatMap((row) => {
                const source = sources.find(
                    (candidate) => candidate.uuid === row.dbt_source_uuid,
                );
                return source
                    ? [
                          {
                              key: source.key,
                              projectName: row.project_name,
                              nodes: row.nodes,
                              referencedProjects: row.referenced_projects,
                          },
                      ]
                    : [];
            });
            this.rowsLoaded = matched.length;
            return matched;
        } catch (error) {
            logCrossSourceCacheError(error);
            return [];
        }
    }

    async resolved(
        dbtSourceUuid: string,
        nodes: DbtExternalModelNode[],
        projectName: string | null,
        referencedProjects: string[],
    ): Promise<void> {
        if (projectName === null) return;
        try {
            const entry = {
                projectUuid: this.projectUuid,
                dbtSourceUuid,
                connectionGroup: this.connectionGroup,
                projectName,
                dbtVersion: this.dbtVersion,
                nodes,
                referencedProjects,
                compileJobUuid: this.compileJobUuid,
            };
            if (this.deferWrites) {
                this.pending.set(dbtSourceUuid, entry);
                return;
            }
            const digest = await this.model.upsertProvisional(entry);
            this.entries.set(dbtSourceUuid, digest);
            this.rowsWritten += 1;
        } catch (error) {
            logCrossSourceCacheError(error);
        }
    }

    discard(dbtSourceUuid: string): void {
        this.entries.delete(dbtSourceUuid);
        this.pending.delete(dbtSourceUuid);
    }

    async confirm(trx?: Knex.Transaction): Promise<void> {
        try {
            await [...this.pending].reduce(async (previous, [uuid, entry]) => {
                await previous;
                const digest = await this.model.upsertProvisional(entry, trx);
                this.entries.set(uuid, digest);
            }, Promise.resolve());
            const confirmation = {
                projectUuid: this.projectUuid,
                connectionGroup: this.connectionGroup,
                entries: [...this.entries].map(
                    ([dbtSourceUuid, nodesDigest]) => ({
                        dbtSourceUuid,
                        nodesDigest,
                    }),
                ),
            };
            if (trx) await this.model.confirm(confirmation, trx);
            else await this.model.confirm(confirmation);
        } catch (error) {
            if (trx) throw error;
            logCrossSourceCacheError(error);
        }
    }
}
