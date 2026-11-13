import {
    NotFoundError,
    parseComposerPipeline,
    parseComposerStoredChart,
    UnexpectedServerError,
    type ComposerChart,
    type ComposerChartPipeline,
    type ComposerStoredChart,
} from '@lightdash/common';
import { Knex } from 'knex';
import {
    ComposerChartsTableName,
    ComposerChartVersionsTableName,
    DashboardTileComposerChartsTableName,
} from '../database/entities/composerCharts';
import {
    DashboardsTableName,
    DashboardVersionsTableName,
} from '../database/entities/dashboards';
import { generateUniqueSlugScopedToProject } from '../utils/SlugUtils';

export type CreateComposerChartRecord = {
    /** Supplied when a chart keeps an existing identity; generated otherwise. */
    uuid: string | null;
    projectUuid: string;
    dashboardUuid: string;
    name: string;
    description: string | null;
    pipeline: ComposerChartPipeline;
    chart: ComposerStoredChart;
    createdByUserUuid: string;
};

export class ComposerChartModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    async create(record: CreateComposerChartRecord): Promise<string> {
        return this.database.transaction(async (trx) => {
            const slug = await generateUniqueSlugScopedToProject(
                trx,
                record.projectUuid,
                ComposerChartsTableName,
                record.name,
            );
            const [{ composer_chart_uuid: uuid }] = await trx(
                ComposerChartsTableName,
            )
                .insert({
                    ...(record.uuid
                        ? { composer_chart_uuid: record.uuid }
                        : {}),
                    project_uuid: record.projectUuid,
                    dashboard_uuid: record.dashboardUuid,
                    name: record.name,
                    description: record.description,
                    slug,
                    created_by_user_uuid: record.createdByUserUuid,
                })
                .returning('composer_chart_uuid');
            await trx(ComposerChartVersionsTableName).insert({
                composer_chart_uuid: uuid,
                pipeline: JSON.stringify(record.pipeline),
                chart: JSON.stringify(record.chart),
                created_by_user_uuid: record.createdByUserUuid,
            });
            return uuid;
        });
    }

    async getOwner(
        uuid: string,
    ): Promise<{ projectUuid: string; dashboardUuid: string }> {
        const row = await this.database(ComposerChartsTableName)
            .select('project_uuid', 'dashboard_uuid')
            .where('composer_chart_uuid', uuid)
            .whereNull('deleted_at')
            .first();
        if (!row) throw new NotFoundError('Composer chart not found');
        if (!row.dashboard_uuid) {
            throw new UnexpectedServerError(
                `Composer chart ${uuid} is not owned by a dashboard`,
            );
        }
        return {
            projectUuid: row.project_uuid,
            dashboardUuid: row.dashboard_uuid,
        };
    }

    /** Copies the chart and its latest version, unparsed, onto another dashboard. */
    async duplicate(
        sourceUuid: string,
        target: { dashboardUuid: string; userUuid: string },
    ): Promise<string> {
        return this.database.transaction(async (trx) => {
            const source = await trx(ComposerChartsTableName)
                .innerJoin(
                    ComposerChartVersionsTableName,
                    `${ComposerChartVersionsTableName}.composer_chart_uuid`,
                    `${ComposerChartsTableName}.composer_chart_uuid`,
                )
                .select(
                    `${ComposerChartsTableName}.project_uuid`,
                    `${ComposerChartsTableName}.name`,
                    `${ComposerChartsTableName}.description`,
                    `${ComposerChartVersionsTableName}.pipeline`,
                    `${ComposerChartVersionsTableName}.chart`,
                )
                .where(
                    `${ComposerChartsTableName}.composer_chart_uuid`,
                    sourceUuid,
                )
                .whereNull(`${ComposerChartsTableName}.deleted_at`)
                .orderBy(`${ComposerChartVersionsTableName}.created_at`, 'desc')
                .first();
            if (!source) throw new NotFoundError('Composer chart not found');
            const slug = await generateUniqueSlugScopedToProject(
                trx,
                source.project_uuid,
                ComposerChartsTableName,
                source.name,
            );
            const [{ composer_chart_uuid: uuid }] = await trx(
                ComposerChartsTableName,
            )
                .insert({
                    project_uuid: source.project_uuid,
                    dashboard_uuid: target.dashboardUuid,
                    name: source.name,
                    description: source.description,
                    slug,
                    created_by_user_uuid: target.userUuid,
                })
                .returning('composer_chart_uuid');
            await trx(ComposerChartVersionsTableName).insert({
                composer_chart_uuid: uuid,
                pipeline: JSON.stringify(source.pipeline),
                chart: JSON.stringify(source.chart),
                created_by_user_uuid: target.userUuid,
            });
            return uuid;
        });
    }

    /** Deletes the dashboard's charts that no version of it shows, except `keep`. */
    async deleteOrphans(
        dashboardUuid: string,
        keep: ReadonlySet<string>,
    ): Promise<string[]> {
        const shown = this.database(DashboardTileComposerChartsTableName)
            .innerJoin(
                DashboardVersionsTableName,
                `${DashboardVersionsTableName}.dashboard_version_id`,
                `${DashboardTileComposerChartsTableName}.dashboard_version_id`,
            )
            .innerJoin(
                DashboardsTableName,
                `${DashboardsTableName}.dashboard_id`,
                `${DashboardVersionsTableName}.dashboard_id`,
            )
            .where(`${DashboardsTableName}.dashboard_uuid`, dashboardUuid)
            .select(
                `${DashboardTileComposerChartsTableName}.composer_chart_uuid`,
            );
        return this.database(ComposerChartsTableName)
            .where('dashboard_uuid', dashboardUuid)
            .whereNull('deleted_at')
            .whereNotIn('composer_chart_uuid', shown)
            .whereNotIn('composer_chart_uuid', [...keep])
            .delete()
            .returning('composer_chart_uuid')
            .then((rows) => rows.map((row) => row.composer_chart_uuid));
    }

    /** Appends a copy of the version current when the dashboard version was saved, if any. */
    async rollbackToDashboardVersion(
        uuid: string,
        dashboardVersionUuid: string,
        userUuid: string,
        trx: Knex.Transaction,
    ): Promise<void> {
        // Compared in Postgres: a JS Date would drop the microseconds
        const version = await trx(ComposerChartVersionsTableName)
            .select('pipeline', 'chart')
            .where('composer_chart_uuid', uuid)
            .where(
                'created_at',
                '<=',
                trx(DashboardVersionsTableName)
                    .select('created_at')
                    .where('dashboard_version_uuid', dashboardVersionUuid),
            )
            .orderBy('created_at', 'desc')
            .first();
        if (!version) return;
        await trx(ComposerChartVersionsTableName).insert({
            composer_chart_uuid: uuid,
            pipeline: JSON.stringify(version.pipeline),
            chart: JSON.stringify(version.chart),
            created_by_user_uuid: userUuid,
        });
    }

    /** The chart and its latest version; its documents parsed strictly. */
    async get(uuid: string): Promise<ComposerChart> {
        const row = await this.database(ComposerChartsTableName)
            .innerJoin(
                ComposerChartVersionsTableName,
                `${ComposerChartVersionsTableName}.composer_chart_uuid`,
                `${ComposerChartsTableName}.composer_chart_uuid`,
            )
            .select(
                `${ComposerChartsTableName}.*`,
                `${ComposerChartVersionsTableName}.composer_chart_version_uuid`,
                `${ComposerChartVersionsTableName}.pipeline`,
                `${ComposerChartVersionsTableName}.chart`,
                `${ComposerChartVersionsTableName}.created_at as version_created_at`,
                `${ComposerChartVersionsTableName}.created_by_user_uuid as version_created_by_user_uuid`,
            )
            .where(`${ComposerChartsTableName}.composer_chart_uuid`, uuid)
            .whereNull(`${ComposerChartsTableName}.deleted_at`)
            .orderBy(`${ComposerChartVersionsTableName}.created_at`, 'desc')
            .first();
        if (!row) throw new NotFoundError('Composer chart not found');
        if (!row.dashboard_uuid) {
            throw new UnexpectedServerError(
                `Composer chart ${uuid} is not owned by a dashboard`,
            );
        }

        let pipeline: ComposerChartPipeline;
        let chart: ComposerStoredChart;
        try {
            pipeline = parseComposerPipeline(row.pipeline);
            chart = parseComposerStoredChart(row.chart);
        } catch (e) {
            throw new UnexpectedServerError(
                `Stored composer chart ${uuid} cannot be read: ${
                    e instanceof Error ? e.message : String(e)
                }`,
            );
        }

        return {
            uuid: row.composer_chart_uuid,
            projectUuid: row.project_uuid,
            dashboardUuid: row.dashboard_uuid,
            name: row.name,
            description: row.description,
            slug: row.slug,
            createdAt: row.created_at,
            createdByUserUuid: row.created_by_user_uuid,
            versionUuid: row.composer_chart_version_uuid,
            pipeline,
            chart,
            updatedAt: row.version_created_at,
            updatedByUserUuid: row.version_created_by_user_uuid,
        };
    }
}
