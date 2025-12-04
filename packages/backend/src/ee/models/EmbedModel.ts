import { Embed, NotFoundError, UpdateEmbed } from '@lightdash/common';
import { Knex } from 'knex';

type Dependencies = {
    database: Knex;
};
export class EmbedModel {
    private database: Knex;

    constructor(dependencies: Dependencies) {
        this.database = dependencies.database;
    }

    async get(projectUuid: string): Promise<Embed> {
        const [embed] = await this.database('embedding')
            .select(
                'embedding.project_uuid',
                'embedding.encoded_secret',
                'embedding.dashboard_uuids',
                'embedding.allow_all_dashboards',
                'embedding.chart_uuids',
                'embedding.allow_all_charts',
                'embedding.created_at',
                'users.user_uuid',
                'users.first_name',
                'users.last_name',
                'organizations.organization_uuid',
                'organizations.organization_name',
                'organizations.created_at',
            )
            .leftJoin('users', 'embedding.created_by', 'users.user_uuid')
            .leftJoin(
                'projects',
                'projects.project_uuid',
                'embedding.project_uuid',
            )
            .leftJoin(
                'organizations',
                'organizations.organization_id',
                'projects.organization_id',
            )
            .where('embedding.project_uuid', projectUuid);

        if (!embed) {
            throw new NotFoundError(
                `Embed not found for project ${projectUuid}`,
            );
        }

        const dashboards = await this.database('dashboards')
            .select()
            .whereIn('dashboard_uuid', embed.dashboard_uuids);

        const validDashboardUuids = dashboards.map(
            (dashboard) => dashboard.dashboard_uuid,
        );

        const charts = await this.database('saved_queries')
            .select()
            .whereIn('saved_query_uuid', embed.chart_uuids);

        const validChartUuids = charts.map((chart) => chart.saved_query_uuid);

        return {
            projectUuid: embed.project_uuid,
            organization: {
                organizationUuid: embed.organization_uuid,
                name: embed.organization_name,
                createdAt: embed.created_at,
            },
            encodedSecret: embed.encoded_secret,
            dashboardUuids: validDashboardUuids,
            allowAllDashboards: embed.allow_all_dashboards,
            chartUuids: validChartUuids,
            allowAllCharts: embed.allow_all_charts,
            createdAt: embed.created_at,
            user: embed.user_uuid
                ? {
                      userUuid: embed.user_uuid,
                      firstName: embed.first_name,
                      lastName: embed.last_name,
                  }
                : null,
        };
    }

    async save(
        projectUuid: string,
        encodedSecret: Buffer,
        userUuid: string,
        dashboardUuids: string[] = [],
        allowAllDashboards: boolean = false,
        chartUuids: string[] = [],
        allowAllCharts: boolean = false,
    ): Promise<void> {
        await this.database('embedding')
            .insert({
                project_uuid: projectUuid,
                encoded_secret: encodedSecret,
                dashboard_uuids: dashboardUuids,
                created_by: userUuid,
                allow_all_dashboards: allowAllDashboards,
                chart_uuids: chartUuids,
                allow_all_charts: allowAllCharts,
            })
            .onConflict('project_uuid')
            .merge();
    }

    async updateDashboards(
        projectUuid: string,
        {
            dashboardUuids,
            allowAllDashboards,
        }: Pick<UpdateEmbed, 'dashboardUuids' | 'allowAllDashboards'>,
    ): Promise<void> {
        await this.database('embedding')
            .update({
                dashboard_uuids: dashboardUuids,
                allow_all_dashboards: allowAllDashboards,
            })
            .where('project_uuid', projectUuid);
    }

    async updateConfig(
        projectUuid: string,
        {
            dashboardUuids,
            allowAllDashboards,
            chartUuids,
            allowAllCharts,
        }: UpdateEmbed,
    ): Promise<void> {
        await this.database('embedding')
            .update({
                dashboard_uuids: dashboardUuids,
                allow_all_dashboards: allowAllDashboards,
                chart_uuids: chartUuids,
                allow_all_charts: allowAllCharts,
            })
            .where('project_uuid', projectUuid);
    }
}
