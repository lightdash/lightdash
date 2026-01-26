import {
    DashboardSummary,
    DashboardSummaryTone,
    NotFoundError,
} from '@lightdash/common';
import { Knex } from 'knex';
import { DashboardSummariesTableName } from '../database/entities/dashboardSummaries';

type Dependencies = {
    database: Knex;
};

export class DashboardSummaryModel {
    private database: Knex;

    constructor(dependencies: Dependencies) {
        this.database = dependencies.database;
    }

    async getByDashboardUuid(dashboardUuid: string): Promise<DashboardSummary> {
        const [summary] = await this.database(DashboardSummariesTableName)
            .select()
            .orderBy('created_at', 'desc')
            .where({ dashboard_uuid: dashboardUuid })
            .limit(1);

        if (!summary) {
            throw new NotFoundError(
                `Summary not found for dashboard ${dashboardUuid}`,
            );
        }

        return {
            dashboardSummaryUuid: summary.dashboard_summary_uuid,
            dashboardUuid: summary.dashboard_uuid,
            dashboardVersionId: summary.dashboard_version_id,
            context: summary.context,
            tone: summary.tone,
            audiences: summary.audiences,
            summary: summary.summary,
            createdAt: summary.created_at,
        };
    }

    async save(
        dashboardUuid: string,
        dashboardVersionId: number,
        summary: string,
        tone: DashboardSummaryTone,
        audiences: string[],
        context?: string | null,
    ): Promise<DashboardSummary> {
        const rows = await this.database(DashboardSummariesTableName)
            .insert({
                dashboard_uuid: dashboardUuid,
                dashboard_version_id: dashboardVersionId,
                summary,
                context,
                tone,
                audiences,
            })
            .returning('*');

        const row = rows[0];

        return {
            dashboardSummaryUuid: row.dashboard_summary_uuid,
            dashboardUuid: row.dashboard_uuid,
            dashboardVersionId: row.dashboard_version_id,
            context: row.context,
            tone: row.tone,
            audiences: row.audiences,
            summary: row.summary,
            createdAt: row.created_at,
        };
    }
}
