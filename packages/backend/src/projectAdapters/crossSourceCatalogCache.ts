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

    private readonly entries = new Map<
        string,
        {
            nodes: DbtExternalModelNode[];
            projectName: string;
            referencedProjects: string[];
        }
    >();

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
        this.entries.set(dbtSourceUuid, {
            nodes,
            projectName,
            referencedProjects,
        });
    }

    discard(dbtSourceUuid: string): void {
        this.entries.delete(dbtSourceUuid);
    }

    async confirm(): Promise<void> {
        try {
            await this.model.replaceConfirmed({
                projectUuid: this.projectUuid,
                connectionGroup: this.connectionGroup,
                dbtVersion: this.dbtVersion,
                compileJobUuid: this.compileJobUuid,
                entries: [...this.entries].map(([dbtSourceUuid, entry]) => ({
                    dbtSourceUuid,
                    ...entry,
                })),
            });
            this.rowsWritten += this.entries.size;
            this.entries.clear();
        } catch (error) {
            logCrossSourceCacheError(error);
        }
    }
}
