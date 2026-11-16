import {
    ChartType,
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
import { SpaceTableName } from '../database/entities/spaces';
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
    ): Promise<void> {
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
        await this.database(ComposerChartsTableName)
            .where('dashboard_uuid', dashboardUuid)
            .whereNull('deleted_at')
            .whereNotIn('composer_chart_uuid', shown)
            .whereNotIn('composer_chart_uuid', [...keep])
            .delete();
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

    /** Live charts on live dashboards whose current version renders the custom chart type. */
    private usingDataAppVizQuery(
        database: Knex,
        projectUuid: string,
        dataAppVizUuid: string,
    ) {
        return database(ComposerChartsTableName)
            .innerJoin(
                DashboardsTableName,
                `${DashboardsTableName}.dashboard_uuid`,
                `${ComposerChartsTableName}.dashboard_uuid`,
            )
            .innerJoin(
                SpaceTableName,
                `${SpaceTableName}.space_id`,
                `${DashboardsTableName}.space_id`,
            )
            .joinRaw(
                `CROSS JOIN LATERAL (
                    SELECT pipeline, chart FROM ${ComposerChartVersionsTableName}
                    WHERE composer_chart_uuid = ${ComposerChartsTableName}.composer_chart_uuid
                    ORDER BY created_at DESC
                    LIMIT 1
                ) AS current_version`,
            )
            .where(`${ComposerChartsTableName}.project_uuid`, projectUuid)
            .whereNull(`${ComposerChartsTableName}.deleted_at`)
            .whereNull(`${DashboardsTableName}.deleted_at`)
            .whereNull(`${SpaceTableName}.deleted_at`)
            .whereRaw(`current_version.chart #>> '{chartConfig,type}' = ?`, [
                ChartType.DATA_APP_VIZ,
            ])
            .whereRaw(
                `current_version.chart #>> '{chartConfig,config,dataAppVizUuid}' = ?`,
                [dataAppVizUuid],
            );
    }

    async countUsingDataAppViz(
        projectUuid: string,
        dataAppVizUuid: string,
    ): Promise<number> {
        const [result] = await this.usingDataAppVizQuery(
            this.database,
            projectUuid,
            dataAppVizUuid,
        ).count<{ count: string }[]>({ count: '*' });
        return Number(result.count);
    }

    /**
     * Appends a version pinning `version` to each chart using the type, a copy
     * of its current version otherwise; older versions keep their pin.
     */
    async repinUsingDataAppViz(
        projectUuid: string,
        dataAppVizUuid: string,
        version: number,
        userUuid: string,
    ): Promise<number> {
        return this.database.transaction(async (trx) => {
            const moved = await trx
                .into(
                    trx.raw(
                        '?? (composer_chart_uuid, pipeline, chart, created_by_user_uuid)',
                        [ComposerChartVersionsTableName],
                    ),
                )
                .insert(
                    this.usingDataAppVizQuery(trx, projectUuid, dataAppVizUuid)
                        .whereRaw(
                            `(current_version.chart #> '{chartConfig,config,dataAppVizVersion}') IS DISTINCT FROM to_jsonb(?::integer)`,
                            [version],
                        )
                        .select(
                            `${ComposerChartsTableName}.composer_chart_uuid`,
                            'current_version.pipeline',
                            trx.raw(
                                `jsonb_set(current_version.chart, '{chartConfig,config,dataAppVizVersion}', to_jsonb(?::integer), true)`,
                                [version],
                            ),
                            trx.raw('?::uuid', [userUuid]),
                        ),
                )
                .returning('composer_chart_uuid');
            return moved.length;
        });
    }

    /** Re-points a preview project's charts from the custom chart types they were copied with onto the preview's copies. */
    async remapPreviewDataAppVizs(
        previewProjectUuid: string,
        mappings: Array<{
            sourceAppUuid: string;
            previewAppUuid: string;
            previewAppVersion: number;
        }>,
    ): Promise<void> {
        /* eslint-disable no-await-in-loop */
        for (const mapping of mappings) {
            await this.database(ComposerChartVersionsTableName)
                .whereIn(
                    'composer_chart_uuid',
                    this.database(ComposerChartsTableName)
                        .where('project_uuid', previewProjectUuid)
                        .select('composer_chart_uuid'),
                )
                .whereRaw(
                    `chart #>> '{chartConfig,type}' = ? AND chart #>> '{chartConfig,config,dataAppVizUuid}' = ?`,
                    [ChartType.DATA_APP_VIZ, mapping.sourceAppUuid],
                )
                .update({
                    chart: this.database.raw(
                        `jsonb_set(
                            jsonb_set(chart, '{chartConfig,config,dataAppVizUuid}', to_jsonb(?::text)),
                            '{chartConfig,config,dataAppVizVersion}',
                            to_jsonb(?::integer),
                            true
                        )`,
                        [mapping.previewAppUuid, mapping.previewAppVersion],
                    ) as unknown as string,
                });
        }
        /* eslint-enable no-await-in-loop */
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
