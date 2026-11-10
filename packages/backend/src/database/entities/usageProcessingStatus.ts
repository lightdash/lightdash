import { type AnalyticsProcessingStatus } from '@lightdash/common';
import { type Knex } from 'knex';

export const UsageProcessingStatusTableName = 'usage_processing_status';

export type DbUsageProcessingStatus = {
    organization_uuid: string;
    run_uuid: string;
    started_at: Date;
    finished_at: Date | null;
    status: AnalyticsProcessingStatus['status'];
    last_successful_at: Date | null;
    stats: AnalyticsProcessingStatus['stats'];
};

export type UsageProcessingStatusTable =
    Knex.CompositeTableType<DbUsageProcessingStatus>;
