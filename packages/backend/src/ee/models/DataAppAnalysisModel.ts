import type {
    DataAppAnalysisSource,
    DataAppDetectResult,
    DataAppInvestigateResult,
    DataAppPromptResult,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    DataAppAnalysesTableName,
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
        | { operation: 'detect'; result: DataAppDetectResult }
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
