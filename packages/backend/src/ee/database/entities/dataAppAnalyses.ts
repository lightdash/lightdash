import type {
    DataAppAnalysisSource,
    DataAppDetectResult,
} from '@lightdash/common';
import { Knex } from 'knex';

export const DataAppAnalysesTableName = 'data_app_analyses';

export type DbDataAppAnalysis = {
    data_app_analysis_uuid: string;
    organization_uuid: string;
    project_uuid: string;
    app_id: string;
    app_version: number;
    created_by_user_uuid: string;
    operation: 'detect';
    sources: DataAppAnalysisSource[];
    instructions: string | null;
    result: DataAppDetectResult;
    model_id: string | null;
    created_at: Date;
};

// jsonb columns are JSON-stringified on insert (pg would treat a JS array
// as a Postgres array, not jsonb)
export type DbCreateDataAppAnalysis = Omit<
    DbDataAppAnalysis,
    'data_app_analysis_uuid' | 'created_at' | 'sources' | 'result'
> & { sources: string; result: string };

export type DataAppAnalysesTable = Knex.CompositeTableType<
    DbDataAppAnalysis,
    DbCreateDataAppAnalysis
>;
