import { getErrorMessage, type DbtExternalModelNode } from '@lightdash/common';
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

    constructor(
        private readonly model: DbtSourceRefCatalogModel,
        private readonly projectUuid: string,
        private readonly connectionGroup: string,
        private readonly dbtVersion: string,
        private readonly compileJobUuid: string | null,
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
            const digest = await this.model.upsertProvisional({
                projectUuid: this.projectUuid,
                dbtSourceUuid,
                connectionGroup: this.connectionGroup,
                projectName,
                dbtVersion: this.dbtVersion,
                nodes,
                referencedProjects,
                compileJobUuid: this.compileJobUuid,
            });
            this.entries.set(dbtSourceUuid, digest);
            this.rowsWritten += 1;
        } catch (error) {
            logCrossSourceCacheError(error);
        }
    }

    discard(dbtSourceUuid: string): void {
        this.entries.delete(dbtSourceUuid);
    }

    async confirm(): Promise<void> {
        try {
            await this.model.confirm({
                projectUuid: this.projectUuid,
                connectionGroup: this.connectionGroup,
                entries: [...this.entries].map(
                    ([dbtSourceUuid, nodesDigest]) => ({
                        dbtSourceUuid,
                        nodesDigest,
                    }),
                ),
            });
        } catch (error) {
            logCrossSourceCacheError(error);
        }
    }
}
