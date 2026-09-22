import type {
    DataAppAnalysisSource,
    DataAppDetectResult,
    DataAppInvestigateResult,
    DataAppPromptResult,
} from '@lightdash/common';
import { Knex } from 'knex';

export const DataAppAnalysesTableName = 'data_app_analyses';

/** Hash of one source's section (legend + rows), keyed by the query it came from. */
export type DataAppSourceHash = { queryUuid: string; hash: string };

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
    content_hash: string | null;
    source_hashes: DataAppSourceHash[] | null;
    reused_from_analysis_uuid: string | null;
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
        | {
              operation: 'prompt';
              result: DataAppPromptResult;
              parent_analysis_uuid: null;
              anomaly_id: null;
              agent_uuid: null;
              thread_uuid: null;
          }
    );

// jsonb columns are JSON-stringified on insert (pg would treat a JS array
// as a Postgres array, not jsonb)
export type DbCreateDataAppAnalysis = Omit<
    DbDataAppAnalysisBase,
    'data_app_analysis_uuid' | 'created_at' | 'sources' | 'source_hashes'
> & {
    operation: 'detect' | 'investigate' | 'prompt';
    sources: string;
    source_hashes: string | null;
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

export const DataAppAnalysisRateCountersTableName =
    'data_app_analysis_rate_counters';

export type DataAppAnalysisOperation = 'detect' | 'prompt' | 'investigate';

export type DbDataAppAnalysisRateCounter = {
    app_id: string;
    user_uuid: string;
    operation: DataAppAnalysisOperation;
    window_started_at: Date;
    request_count: number;
};

export type DataAppAnalysisRateCountersTable = Knex.CompositeTableType<
    DbDataAppAnalysisRateCounter,
    DbDataAppAnalysisRateCounter
>;
