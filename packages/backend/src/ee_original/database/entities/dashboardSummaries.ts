import { DashboardSummaryTone } from '@lightdash/common';
import { Knex } from 'knex';

export const DashboardSummariesTableName = 'dashboard_summaries';

type DbDashboardSummary = {
    dashboard_summary_uuid: string;
    dashboard_uuid: string;
    dashboard_version_id: number;
    context?: string | null;
    tone: DashboardSummaryTone;
    summary: string;
    created_at: Date;
    audiences: string[];
};

type DbDashboardSummaryInsert = Omit<
    DbDashboardSummary,
    'created_at' | 'dashboard_summary_uuid'
>;

export type DashboardSummariesTable = Knex.CompositeTableType<
    DbDashboardSummary,
    DbDashboardSummaryInsert
>;
