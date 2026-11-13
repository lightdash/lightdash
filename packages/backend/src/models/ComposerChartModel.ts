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
} from '../database/entities/composerCharts';
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

    /** Where a chart lives, read without parsing its documents. */
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
