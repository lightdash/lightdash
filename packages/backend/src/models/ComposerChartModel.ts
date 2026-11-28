import {
    assertUnreachable,
    ChartType,
    ConflictError,
    NotFoundError,
    parseComposerPipeline,
    parseComposerStoredChart,
    UnexpectedServerError,
    type ComposerChart,
    type ComposerChartDashboard,
    type ComposerChartOwner,
    type ComposerChartPipeline,
    type ComposerChartWithDetails,
    type ComposerStoredChart,
    type UUID,
    type UuidOrSlug,
} from '@lightdash/common';
import { Knex } from 'knex';
import { validate as isValidUuid } from 'uuid';
import {
    ComposerChartsTableName,
    ComposerChartVersionsTableName,
    DashboardTileComposerChartsTableName,
} from '../database/entities/composerCharts';
import {
    DashboardsTableName,
    DashboardVersionsTableName,
} from '../database/entities/dashboards';
import { OrganizationTableName } from '../database/entities/organizations';
import { ProjectTableName } from '../database/entities/projects';
import { SpaceTableName } from '../database/entities/spaces';
import { UserTableName } from '../database/entities/users';
import { generateUniqueSlugScopedToProject } from '../utils/SlugUtils';

/** An owned chart's pipeline as of a dashboard version, beside its current one. */
export type ComposerChartRollbackPipeline = {
    uuid: string;
    restored: unknown;
    current: unknown;
};

export type CreateComposerChartRecord = {
    /** Supplied when a chart keeps an existing identity; generated otherwise. */
    uuid: string | null;
    /** Inserted exactly when supplied (content as code); generated from the name otherwise. */
    slug: string | null;
    projectUuid: string;
    owner: ComposerChartOwner;
    name: string;
    description: string | null;
    pipeline: ComposerChartPipeline;
    chart: ComposerStoredChart;
    createdByUserUuid: string;
};

type OwnerColumns = {
    dashboard_uuid: string | null;
    space_uuid: string | null;
};

const toOwnerColumns = (owner: ComposerChartOwner): OwnerColumns => {
    switch (owner.type) {
        case 'dashboard':
            return { dashboard_uuid: owner.dashboardUuid, space_uuid: null };
        case 'space':
            return { dashboard_uuid: null, space_uuid: owner.spaceUuid };
        default:
            return assertUnreachable(owner, 'Unknown composer chart owner');
    }
};

const toOwner = (uuid: string, row: OwnerColumns): ComposerChartOwner => {
    if (row.dashboard_uuid && !row.space_uuid) {
        return { type: 'dashboard', dashboardUuid: row.dashboard_uuid };
    }
    if (row.space_uuid && !row.dashboard_uuid) {
        return { type: 'space', spaceUuid: row.space_uuid };
    }
    throw new UnexpectedServerError(
        `Composer chart ${uuid} does not have exactly one owner`,
    );
};

/** One soft deletion of a chart: restore and permanent delete act on it only. */
export type ComposerChartDeletion = {
    deletedAt: Date;
    deletedByUserUuid: string | null;
};

export class ComposerChartModel {
    private readonly database: Knex;

    constructor({ database }: { database: Knex }) {
        this.database = database;
    }

    async create(record: CreateComposerChartRecord): Promise<string> {
        return this.database.transaction(async (trx) => {
            const slug =
                record.slug ??
                (await generateUniqueSlugScopedToProject(
                    trx,
                    record.projectUuid,
                    ComposerChartsTableName,
                    record.name,
                ));
            const [{ composer_chart_uuid: uuid }] = await trx(
                ComposerChartsTableName,
            )
                .insert({
                    ...(record.uuid
                        ? { composer_chart_uuid: record.uuid }
                        : {}),
                    project_uuid: record.projectUuid,
                    ...toOwnerColumns(record.owner),
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
    ): Promise<{ projectUuid: string; owner: ComposerChartOwner }> {
        const row = await this.database(ComposerChartsTableName)
            .select('project_uuid', 'dashboard_uuid', 'space_uuid')
            .where('composer_chart_uuid', uuid)
            .whereNull('deleted_at')
            .first();
        if (!row) throw new NotFoundError('Composer chart not found');
        return { projectUuid: row.project_uuid, owner: toOwner(uuid, row) };
    }

    /** Name and description of a live chart still in the space checked; versions are untouched. */
    async update(
        uuid: string,
        spaceUuid: string,
        fields: { name?: string; description?: string | null },
    ): Promise<ComposerChart> {
        if (fields.name !== undefined || fields.description !== undefined) {
            const count = await this.database(ComposerChartsTableName)
                .update(fields)
                .where('composer_chart_uuid', uuid)
                .where('space_uuid', spaceUuid)
                .whereNull('deleted_at');
            if (count !== 1) {
                throw new ConflictError(
                    'This composer chart moved or was deleted. Reload and try again.',
                );
            }
        }
        return this.get(uuid);
    }

    async moveToSpace(
        {
            projectUuid,
            composerChartUuid,
            sourceSpaceUuid,
            targetSpaceUuid,
        }: {
            projectUuid: string;
            composerChartUuid: string;
            sourceSpaceUuid: string;
            targetSpaceUuid: string;
        },
        { tx = this.database }: { tx?: Knex } = {},
    ): Promise<void> {
        const count = await tx(ComposerChartsTableName)
            .update({ space_uuid: targetSpaceUuid })
            .where('composer_chart_uuid', composerChartUuid)
            .where('project_uuid', projectUuid)
            .where('space_uuid', sourceSpaceUuid)
            .whereNull('deleted_at');
        if (count !== 1) {
            throw new ConflictError(
                'This composer chart moved or was deleted. Reload and try again.',
            );
        }
    }

    /** Deletes a live chart still in the space checked: soft with `deletedByUserUuid`, permanently without. */
    async deleteFromSpace(
        uuid: string,
        spaceUuid: string,
        deletedByUserUuid: string | null,
    ): Promise<void> {
        const query = this.database(ComposerChartsTableName)
            .where('composer_chart_uuid', uuid)
            .where('space_uuid', spaceUuid)
            .whereNull('deleted_at');
        const count =
            deletedByUserUuid === null
                ? await query.delete()
                : await query.update({
                      deleted_at: new Date(),
                      deleted_by_user_uuid: deletedByUserUuid,
                  });
        if (count !== 1) {
            throw new ConflictError(
                'This composer chart moved or was deleted. Reload and try again.',
            );
        }
    }

    /** A soft-deleted chart with its owner and deleter, for restore and permanent delete. */
    async getDeleted(uuid: string): Promise<{
        projectUuid: string;
        organizationUuid: string;
        owner: ComposerChartOwner;
        deletion: ComposerChartDeletion;
    }> {
        const row = await this.database(ComposerChartsTableName)
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_uuid`,
                `${ComposerChartsTableName}.project_uuid`,
            )
            .innerJoin(
                OrganizationTableName,
                `${OrganizationTableName}.organization_id`,
                `${ProjectTableName}.organization_id`,
            )
            .select(
                `${ComposerChartsTableName}.project_uuid`,
                `${ComposerChartsTableName}.dashboard_uuid`,
                `${ComposerChartsTableName}.space_uuid`,
                `${ComposerChartsTableName}.deleted_at`,
                `${ComposerChartsTableName}.deleted_by_user_uuid`,
                `${OrganizationTableName}.organization_uuid`,
            )
            .where(`${ComposerChartsTableName}.composer_chart_uuid`, uuid)
            .whereNotNull(`${ComposerChartsTableName}.deleted_at`)
            .first();
        if (!row) throw new NotFoundError('Deleted composer chart not found');
        return {
            projectUuid: row.project_uuid,
            organizationUuid: row.organization_uuid,
            owner: toOwner(uuid, row),
            deletion: {
                deletedAt: row.deleted_at,
                deletedByUserUuid: row.deleted_by_user_uuid,
            },
        };
    }

    /** Restores the deletion checked of a chart still in the space checked, once that space is live. */
    async restoreToSpace(
        uuid: string,
        spaceUuid: string,
        { deletedAt, deletedByUserUuid }: ComposerChartDeletion,
    ): Promise<void> {
        await this.database.transaction(async (trx) => {
            const space = await trx(SpaceTableName)
                .select('space_uuid')
                .where('space_uuid', spaceUuid)
                .whereNull('deleted_at')
                .forShare()
                .first();
            if (!space) {
                throw new ConflictError(
                    "This composer chart's space is deleted. Restore the space first.",
                );
            }
            const count = await trx(ComposerChartsTableName)
                .where('composer_chart_uuid', uuid)
                .where('space_uuid', spaceUuid)
                .where('deleted_at', deletedAt)
                .where('deleted_by_user_uuid', deletedByUserUuid)
                .update({ deleted_at: null, deleted_by_user_uuid: null });
            if (count !== 1) {
                throw new ConflictError(
                    'This composer chart moved or was restored. Reload and try again.',
                );
            }
        });
    }

    /** Permanently deletes the deletion checked of a chart still in the space checked; its versions cascade. */
    async permanentlyDeleteFromSpace(
        uuid: string,
        spaceUuid: string,
        { deletedAt, deletedByUserUuid }: ComposerChartDeletion,
    ): Promise<void> {
        const count = await this.database(ComposerChartsTableName)
            .where('composer_chart_uuid', uuid)
            .where('space_uuid', spaceUuid)
            .where('deleted_at', deletedAt)
            .where('deleted_by_user_uuid', deletedByUserUuid)
            .delete();
        if (count !== 1) {
            throw new ConflictError(
                'This composer chart moved or was restored. Reload and try again.',
            );
        }
    }

    /** Live dashboards in the project whose latest version has a tile for the chart. */
    async findDashboardsShowing(
        projectUuid: string,
        uuid: string,
    ): Promise<Array<ComposerChartDashboard & { spaceUuid: string }>> {
        return this.database(DashboardTileComposerChartsTableName)
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
            .innerJoin(
                SpaceTableName,
                `${SpaceTableName}.space_id`,
                `${DashboardsTableName}.space_id`,
            )
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .where(
                `${DashboardTileComposerChartsTableName}.composer_chart_uuid`,
                uuid,
            )
            .where(`${ProjectTableName}.project_uuid`, projectUuid)
            .whereNull(`${DashboardsTableName}.deleted_at`)
            .whereNull(`${SpaceTableName}.deleted_at`)
            .whereRaw(
                `?? = (
                    SELECT latest_version.dashboard_version_id FROM ?? AS latest_version
                    WHERE latest_version.dashboard_id = ??
                    ORDER BY latest_version.created_at DESC, latest_version.dashboard_version_id DESC
                    LIMIT 1
                )`,
                [
                    `${DashboardVersionsTableName}.dashboard_version_id`,
                    DashboardVersionsTableName,
                    `${DashboardsTableName}.dashboard_id`,
                ],
            )
            .distinct({
                uuid: `${DashboardsTableName}.dashboard_uuid`,
                name: `${DashboardsTableName}.name`,
                spaceUuid: `${SpaceTableName}.space_uuid`,
            })
            .orderBy([{ column: 'name' }, { column: 'uuid' }]);
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
            // One null in a NOT IN list makes it match nothing
            .whereNotNull(
                `${DashboardTileComposerChartsTableName}.composer_chart_uuid`,
            )
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

    /** The chart's version that was current when the dashboard version was saved. */
    private static versionAsOf(
        database: Knex,
        uuid: string,
        dashboardVersionUuid: string,
    ) {
        // Compared in Postgres: a JS Date would drop the microseconds
        return database(ComposerChartVersionsTableName)
            .select('pipeline', 'chart')
            .where('composer_chart_uuid', uuid)
            .where(
                'created_at',
                '<=',
                database(DashboardVersionsTableName)
                    .select('created_at')
                    .where('dashboard_version_uuid', dashboardVersionUuid),
            )
            .orderBy('created_at', 'desc')
            .first();
    }

    /** The charts among `uuids` the dashboard owns; its tiles may also show a space's charts. */
    async findOwnedByDashboard(
        dashboardUuid: string,
        uuids: string[],
    ): Promise<string[]> {
        if (uuids.length === 0) return [];
        return this.database(ComposerChartsTableName)
            .where('dashboard_uuid', dashboardUuid)
            .whereIn('composer_chart_uuid', uuids)
            .pluck('composer_chart_uuid');
    }

    /** Charts among `uuids` a space owns, live in a live space. */
    async findLiveInSpaces(uuids: string[]): Promise<string[]> {
        if (uuids.length === 0) return [];
        return this.database(ComposerChartsTableName)
            .innerJoin(
                SpaceTableName,
                `${SpaceTableName}.space_uuid`,
                `${ComposerChartsTableName}.space_uuid`,
            )
            .whereIn(`${ComposerChartsTableName}.composer_chart_uuid`, uuids)
            .whereNull(`${ComposerChartsTableName}.deleted_at`)
            .whereNull(`${SpaceTableName}.deleted_at`)
            .pluck(`${ComposerChartsTableName}.composer_chart_uuid`);
    }

    /** Locks the dashboard's own charts among `uuids` against new versions, then returns each one's pipeline as of the dashboard version beside its current one. */
    async lockRollbackPipelines(
        dashboardUuid: string,
        uuids: string[],
        dashboardVersionUuid: string,
        trx: Knex.Transaction,
    ): Promise<ComposerChartRollbackPipeline[]> {
        // A version insert takes a key-share lock on its chart, which this waits for or blocks
        const owned: string[] = await trx(ComposerChartsTableName)
            .where('dashboard_uuid', dashboardUuid)
            .whereIn('composer_chart_uuid', uuids)
            .orderBy('composer_chart_uuid')
            .forUpdate()
            .pluck('composer_chart_uuid');
        const pipelines: ComposerChartRollbackPipeline[] = [];
        for (const uuid of owned) {
            /* eslint-disable no-await-in-loop */
            const restored = await ComposerChartModel.versionAsOf(
                trx,
                uuid,
                dashboardVersionUuid,
            );
            const current = await trx(ComposerChartVersionsTableName)
                .select('pipeline')
                .where('composer_chart_uuid', uuid)
                .orderBy('created_at', 'desc')
                .first();
            /* eslint-enable no-await-in-loop */
            if (restored && current) {
                pipelines.push({
                    uuid,
                    restored: restored.pipeline,
                    current: current.pipeline,
                });
            }
        }
        return pipelines;
    }

    /** Appends a copy of the version current when the dashboard version was saved, if any. */
    async rollbackToDashboardVersion(
        uuid: string,
        dashboardVersionUuid: string,
        userUuid: string,
        trx: Knex.Transaction,
    ): Promise<void> {
        const version = await ComposerChartModel.versionAsOf(
            trx,
            uuid,
            dashboardVersionUuid,
        );
        if (!version) return;
        await trx(ComposerChartVersionsTableName).insert({
            composer_chart_uuid: uuid,
            pipeline: JSON.stringify(version.pipeline),
            chart: JSON.stringify(version.chart),
            created_by_user_uuid: userUuid,
        });
    }

    /** Live charts with a live owner in a live space whose current version renders the custom chart type. */
    private usingDataAppVizQuery(
        database: Knex,
        projectUuid: string,
        dataAppVizUuid: string,
    ) {
        return database(ComposerChartsTableName)
            .leftJoin(DashboardsTableName, function joinLiveDashboard() {
                this.on(
                    `${DashboardsTableName}.dashboard_uuid`,
                    '=',
                    `${ComposerChartsTableName}.dashboard_uuid`,
                ).andOnNull(`${DashboardsTableName}.deleted_at`);
            })
            .innerJoin(SpaceTableName, function joinOwnerSpace() {
                this.on(
                    `${SpaceTableName}.space_uuid`,
                    '=',
                    `${ComposerChartsTableName}.space_uuid`,
                ).orOn(
                    `${SpaceTableName}.space_id`,
                    '=',
                    `${DashboardsTableName}.space_id`,
                );
            })
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

    private latestVersionQuery(database: Knex = this.database) {
        return database(ComposerChartsTableName)
            .joinRaw(
                `CROSS JOIN LATERAL (
                    SELECT composer_chart_version_uuid, pipeline, chart, created_at, created_by_user_uuid
                    FROM ${ComposerChartVersionsTableName}
                    WHERE composer_chart_uuid = ${ComposerChartsTableName}.composer_chart_uuid
                    ORDER BY created_at DESC
                    LIMIT 1
                ) AS current_version`,
            )
            .select(
                `${ComposerChartsTableName}.composer_chart_uuid`,
                `${ComposerChartsTableName}.project_uuid`,
                `${ComposerChartsTableName}.dashboard_uuid`,
                `${ComposerChartsTableName}.space_uuid`,
                `${ComposerChartsTableName}.name`,
                `${ComposerChartsTableName}.description`,
                `${ComposerChartsTableName}.slug`,
                `${ComposerChartsTableName}.created_at`,
                `${ComposerChartsTableName}.created_by_user_uuid`,
                'current_version.composer_chart_version_uuid',
                'current_version.pipeline',
                'current_version.chart',
                'current_version.created_at as version_created_at',
                'current_version.created_by_user_uuid as version_created_by_user_uuid',
            )
            .whereNull(`${ComposerChartsTableName}.deleted_at`);
    }

    private static toComposerChart(row: {
        composer_chart_uuid: string;
        project_uuid: string;
        dashboard_uuid: string | null;
        space_uuid: string | null;
        name: string;
        description: string | null;
        slug: string;
        created_at: Date;
        created_by_user_uuid: string | null;
        composer_chart_version_uuid: string;
        pipeline: unknown;
        chart: unknown;
        version_created_at: Date;
        version_created_by_user_uuid: string | null;
    }): ComposerChart {
        const uuid = row.composer_chart_uuid;
        const owner = toOwner(uuid, row);

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
            uuid,
            projectUuid: row.project_uuid,
            owner,
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

    /** The chart and its latest version; its documents parsed strictly. */
    async get(uuid: string): Promise<ComposerChart> {
        const row = await this.latestVersionQuery()
            .where(`${ComposerChartsTableName}.composer_chart_uuid`, uuid)
            .first();
        if (!row) throw new NotFoundError('Composer chart not found');
        return ComposerChartModel.toComposerChart(row);
    }

    /** A live chart's uuid from its uuid or its slug; slugs are unique within composer charts. */
    async getUuidByUuidOrSlug(
        projectUuid: UUID,
        composerChartUuidOrSlug: UuidOrSlug,
    ): Promise<UUID> {
        const row = await this.database(ComposerChartsTableName)
            .select('composer_chart_uuid')
            .where('project_uuid', projectUuid)
            .where(
                isValidUuid(composerChartUuidOrSlug)
                    ? 'composer_chart_uuid'
                    : 'slug',
                composerChartUuidOrSlug,
            )
            .whereNull('deleted_at')
            .first();
        if (!row) throw new NotFoundError('Composer chart not found');
        return row.composer_chart_uuid;
    }

    /** The chart with its owner's space and the author of its latest version. */
    async getWithDetails(uuid: UUID): Promise<ComposerChartWithDetails> {
        const row = await this.latestVersionQuery()
            .leftJoin(DashboardsTableName, function joinLiveDashboard() {
                this.on(
                    `${DashboardsTableName}.dashboard_uuid`,
                    '=',
                    `${ComposerChartsTableName}.dashboard_uuid`,
                ).andOnNull(`${DashboardsTableName}.deleted_at`);
            })
            .innerJoin(SpaceTableName, function joinOwnerSpace() {
                this.on(
                    `${SpaceTableName}.space_uuid`,
                    '=',
                    `${ComposerChartsTableName}.space_uuid`,
                ).orOn(
                    `${SpaceTableName}.space_id`,
                    '=',
                    `${DashboardsTableName}.space_id`,
                );
            })
            .leftJoin(
                UserTableName,
                `${UserTableName}.user_uuid`,
                'current_version.created_by_user_uuid',
            )
            .select(
                `${SpaceTableName}.space_uuid as owner_space_uuid`,
                `${SpaceTableName}.name as owner_space_name`,
                `${UserTableName}.user_uuid as updated_by_user_uuid`,
                `${UserTableName}.first_name as updated_by_first_name`,
                `${UserTableName}.last_name as updated_by_last_name`,
            )
            .where(`${ComposerChartsTableName}.composer_chart_uuid`, uuid)
            .whereNull(`${SpaceTableName}.deleted_at`)
            .first();
        if (!row) throw new NotFoundError('Composer chart not found');
        return {
            ...ComposerChartModel.toComposerChart(row),
            space: { uuid: row.owner_space_uuid, name: row.owner_space_name },
            updatedByUser: row.updated_by_user_uuid
                ? {
                      userUuid: row.updated_by_user_uuid,
                      firstName: row.updated_by_first_name,
                      lastName: row.updated_by_last_name,
                  }
                : null,
        };
    }

    /** Live charts with a live owner in a live space, for download; all of the project's when `slugs` is undefined. */
    async findForCode(
        projectUuid: string,
        slugs: string[] | undefined,
    ): Promise<
        Array<
            ComposerChart & {
                dashboardSlug: string | null;
                spaceUuid: string;
                spacePath: string;
            }
        >
    > {
        const query = this.latestVersionQuery()
            .leftJoin(DashboardsTableName, function joinLiveDashboard() {
                this.on(
                    `${DashboardsTableName}.dashboard_uuid`,
                    '=',
                    `${ComposerChartsTableName}.dashboard_uuid`,
                ).andOnNull(`${DashboardsTableName}.deleted_at`);
            })
            .innerJoin(SpaceTableName, function joinOwnerSpace() {
                this.on(
                    `${SpaceTableName}.space_uuid`,
                    '=',
                    `${ComposerChartsTableName}.space_uuid`,
                ).orOn(
                    `${SpaceTableName}.space_id`,
                    '=',
                    `${DashboardsTableName}.space_id`,
                );
            })
            .select(
                `${DashboardsTableName}.slug as dashboard_slug`,
                `${SpaceTableName}.space_uuid as owner_space_uuid`,
                `${SpaceTableName}.path as owner_space_path`,
            )
            .where(`${ComposerChartsTableName}.project_uuid`, projectUuid)
            .whereNull(`${SpaceTableName}.deleted_at`)
            .orderBy(`${ComposerChartsTableName}.slug`);
        const rows = await (slugs === undefined
            ? query
            : query.whereIn(`${ComposerChartsTableName}.slug`, slugs));
        return rows.map((row) => ({
            ...ComposerChartModel.toComposerChart(row),
            dashboardSlug: row.dashboard_slug,
            spaceUuid: row.owner_space_uuid,
            spacePath: row.owner_space_path,
        }));
    }

    /** Live charts by slug, which are unique within composer charts only. */
    async findBySlugs(
        projectUuid: string,
        slugs: string[],
    ): Promise<
        Array<{ uuid: string; slug: string; owner: ComposerChartOwner }>
    > {
        if (slugs.length === 0) return [];
        const rows = await this.database(ComposerChartsTableName)
            .select(
                'composer_chart_uuid',
                'slug',
                'dashboard_uuid',
                'space_uuid',
            )
            .where('project_uuid', projectUuid)
            .whereIn('slug', slugs)
            .whereNull('deleted_at');
        return rows.map((row) => ({
            uuid: row.composer_chart_uuid,
            slug: row.slug,
            owner: toOwner(row.composer_chart_uuid, row),
        }));
    }

    /** The chart holding the slug, deleted or not. */
    async findIdentityBySlug(
        projectUuid: string,
        slug: string,
    ): Promise<{
        uuid: string;
        deleted: boolean;
        owner: ComposerChartOwner;
    } | null> {
        const row = await this.database(ComposerChartsTableName)
            .select(
                'composer_chart_uuid',
                'deleted_at',
                'dashboard_uuid',
                'space_uuid',
            )
            .where({ project_uuid: projectUuid, slug })
            .first();
        return row
            ? {
                  uuid: row.composer_chart_uuid,
                  deleted: row.deleted_at !== null,
                  owner: toOwner(row.composer_chart_uuid, row),
              }
            : null;
    }

    /**
     * Content-as-code write: creates the chart with exactly this slug, or
     * appends a version to the chart holding it, reviving it onto `owner`
     * when deleted.
     */
    async writeFromCode(
        record: Omit<CreateComposerChartRecord, 'uuid'> & {
            slug: string;
            existing: { uuid: string; deleted: boolean } | null;
        },
    ): Promise<string> {
        const { existing } = record;
        if (!existing) {
            return this.create({ ...record, uuid: null });
        }
        return this.database.transaction(async (trx) => {
            await trx(ComposerChartsTableName)
                .where('composer_chart_uuid', existing.uuid)
                .update({
                    name: record.name,
                    description: record.description,
                    ...(existing.deleted && {
                        ...toOwnerColumns(record.owner),
                        deleted_at: null,
                        deleted_by_user_uuid: null,
                    }),
                });
            await trx(ComposerChartVersionsTableName).insert({
                composer_chart_uuid: existing.uuid,
                pipeline: JSON.stringify(record.pipeline),
                chart: JSON.stringify(record.chart),
                created_by_user_uuid: record.createdByUserUuid,
            });
            return existing.uuid;
        });
    }
}
