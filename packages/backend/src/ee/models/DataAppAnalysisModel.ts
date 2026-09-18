import type {
    DataAppAnalysisSource,
    DataAppDetectResult,
    DataAppInvestigateResult,
    DataAppPromptResult,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    DataAppAnalysesTableName,
    type DataAppSourceHash,
    type DbDataAppAnalysis,
} from '../database/entities/dataAppAnalyses';

type Dependencies = {
    database: Knex;
};

type CreateBase = {
    organizationUuid: string;
    projectUuid: string;
    appUuid: string;
    appVersion: number;
    createdByUserUuid: string;
    sources: DataAppAnalysisSource[];
    instructions: string | null;
    modelId: string | null;
};

export type CreateDataAppAnalysis = CreateBase &
    (
        | {
              operation: 'detect';
              result: DataAppDetectResult;
              contentHash: string;
              sourceHashes: DataAppSourceHash[];
              reusedFromAnalysisUuid: string | null;
          }
        | {
              operation: 'investigate';
              result: DataAppInvestigateResult;
              parentAnalysisUuid: string;
              anomalyId: string;
              agentUuid: string;
              threadUuid: string;
          }
        | { operation: 'prompt'; result: DataAppPromptResult }
    );

export class DataAppAnalysisModel {
    private readonly database: Knex;

    constructor({ database }: Dependencies) {
        this.database = database;
    }

    async create(data: CreateDataAppAnalysis): Promise<DbDataAppAnalysis> {
        const [row] = await this.database(DataAppAnalysesTableName)
            .insert({
                organization_uuid: data.organizationUuid,
                project_uuid: data.projectUuid,
                app_id: data.appUuid,
                app_version: data.appVersion,
                created_by_user_uuid: data.createdByUserUuid,
                operation: data.operation,
                sources: JSON.stringify(data.sources),
                instructions: data.instructions,
                result: JSON.stringify(data.result),
                model_id: data.modelId,
                content_hash:
                    data.operation === 'detect' ? data.contentHash : null,
                source_hashes:
                    data.operation === 'detect'
                        ? JSON.stringify(data.sourceHashes)
                        : null,
                reused_from_analysis_uuid:
                    data.operation === 'detect'
                        ? data.reusedFromAnalysisUuid
                        : null,
                parent_analysis_uuid:
                    data.operation === 'investigate'
                        ? data.parentAnalysisUuid
                        : null,
                anomaly_id:
                    data.operation === 'investigate' ? data.anomalyId : null,
                agent_uuid:
                    data.operation === 'investigate' ? data.agentUuid : null,
                thread_uuid:
                    data.operation === 'investigate' ? data.threadUuid : null,
            })
            .returning('*');
        return row;
    }

    /**
     * Newest detection that read exactly this content. `userUuid` narrows to
     * the viewer's own rows; without it any viewer's row qualifies (identical
     * content means identical rows, so nothing leaks).
     */
    async findLatestDetectByHash(filter: {
        appUuid: string;
        appVersion: number;
        contentHash: string;
        userUuid: string | null;
    }): Promise<(DbDataAppAnalysis & { operation: 'detect' }) | null> {
        const row = await this.database(DataAppAnalysesTableName)
            .where({
                app_id: filter.appUuid,
                app_version: filter.appVersion,
                content_hash: filter.contentHash,
                operation: 'detect',
                ...(filter.userUuid
                    ? { created_by_user_uuid: filter.userUuid }
                    : {}),
            })
            .orderBy('created_at', 'desc')
            .first();
        return (
            (row as
                | (DbDataAppAnalysis & { operation: 'detect' })
                | undefined) ?? null
        );
    }

    /**
     * Points a detection at the queries the viewer has now. The rows are
     * identical (same content hash), only the query uuids moved.
     */
    async rebindSources(
        analysisUuid: string,
        data: {
            sources: DataAppAnalysisSource[];
            sourceHashes: DataAppSourceHash[];
            result: DataAppDetectResult;
        },
    ): Promise<void> {
        await this.database(DataAppAnalysesTableName)
            .where({ data_app_analysis_uuid: analysisUuid })
            .update({
                sources: JSON.stringify(data.sources),
                source_hashes: JSON.stringify(data.sourceHashes),
                result: JSON.stringify(data.result),
            });
    }

    /** Investigations of one detection, oldest first. */
    async findInvestigations(
        parentAnalysisUuid: string,
    ): Promise<(DbDataAppAnalysis & { operation: 'investigate' })[]> {
        const rows = await this.database(DataAppAnalysesTableName)
            .where({
                parent_analysis_uuid: parentAnalysisUuid,
                operation: 'investigate',
            })
            .orderBy('created_at', 'asc');
        return rows as (DbDataAppAnalysis & { operation: 'investigate' })[];
    }

    /** Scoped to the viewer and app so a foreign analysis id reads as absent. */
    async find(
        analysisUuid: string,
        appUuid: string,
        userUuid: string,
    ): Promise<DbDataAppAnalysis | null> {
        const row = await this.database(DataAppAnalysesTableName)
            .where({
                data_app_analysis_uuid: analysisUuid,
                app_id: appUuid,
                created_by_user_uuid: userUuid,
            })
            .first();
        return row ?? null;
    }
}
