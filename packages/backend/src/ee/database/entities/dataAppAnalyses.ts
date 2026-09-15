import type {
    DataAppAnalysisSource,
    DataAppDetectResult,
    DataAppInvestigateResult,
} from '@lightdash/common';
import { Knex } from 'knex';

export const DataAppAnalysesTableName = 'data_app_analyses';

type DbDataAppAnalysisBase = {
    data_app_analysis_uuid: string;
    organization_uuid: string;
    project_uuid: string;
    app_id: string;
    app_version: number;
    created_by_user_uuid: string;
    sources: DataAppAnalysisSource[];
    instructions: string | null;
    model_id: string | null;
    created_at: Date;
};

export type DbDataAppAnalysis = DbDataAppAnalysisBase &
    (
        | {
              operation: 'detect';
              result: DataAppDetectResult;
              parent_analysis_uuid: null;
              anomaly_id: null;
              agent_uuid: null;
              thread_uuid: null;
          }
        | {
              operation: 'investigate';
              result: DataAppInvestigateResult;
              parent_analysis_uuid: string;
              anomaly_id: string;
              agent_uuid: string;
              thread_uuid: string;
          }
    );

// jsonb columns are JSON-stringified on insert (pg would treat a JS array
// as a Postgres array, not jsonb)
export type DbCreateDataAppAnalysis = Omit<
    DbDataAppAnalysisBase,
    'data_app_analysis_uuid' | 'created_at' | 'sources'
> & {
    operation: 'detect' | 'investigate';
    sources: string;
    result: string;
    parent_analysis_uuid: string | null;
    anomaly_id: string | null;
    agent_uuid: string | null;
    thread_uuid: string | null;
};

export type DataAppAnalysesTable = Knex.CompositeTableType<
    DbDataAppAnalysis,
    DbCreateDataAppAnalysis
>;
