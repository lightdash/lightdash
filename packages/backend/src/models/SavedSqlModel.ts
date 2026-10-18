import { type AgentIdentityClaim } from '@lightdash/common';
import {
    AllVizChartConfig,
    ContentReviewContentType,
    convertPipelineChartToSqlChart,
    convertSqlChartToPipelineChart,
    CreateSavedChartVersion,
    CreateSqlChart,
    generateSlug,
    normalizeAgentIdentityClaim,
    NotFoundError,
    ProjectType,
    ResolvedProjectColorPalette,
    SavedChartDAO,
    SessionUser,
    SpaceSummary,
    SqlChart,
    UpdateSqlChart,
} from '@lightdash/common';
import { Knex } from 'knex';
import { LightdashConfig } from '../config/parseConfig';
import { resolveColorPalette } from '../database/entities/organizationColorPalettes';
import { DbOrganization } from '../database/entities/organizations';
import { DbProject } from '../database/entities/projects';
import { DbSavedSql, DbSavedSqlVersion } from '../database/entities/savedSql';
import { DbSpace } from '../database/entities/spaces';
import { cancelPendingContentReviewRequests } from './ContentReviewRequestModel';
import { storedVersionAgentIdentity } from './ContentVersionIdentity';
import { type OnContentVersionCreated } from './OnContentVersionCreated';
import { type SavedChartModel } from './SavedChartModel';

export type SqlChartConnectionBinding = {
    kind: 'connection';
    warehouseConnectionUuid: string | null;
};

export type SqlChartVersionBinding =
    | SqlChartConnectionBinding
    | { kind: 'latest' };

type SelectSavedSql = Pick<
    DbSavedSql,
    | 'saved_sql_uuid'
    | 'name'
    | 'description'
    | 'slug'
    | 'dashboard_uuid'
    | 'created_at'
    | 'last_version_updated_at'
    | 'views_count'
    | 'first_viewed_at'
    | 'last_viewed_at'
> &
    Pick<
        DbSavedSqlVersion,
        | 'saved_sql_version_uuid'
        | 'sql'
        | 'limit'
        | 'config'
        | 'chart_kind'
        | 'agent_identity'
    > & {
        warehouse_connection_uuid: string | null;
    } & Pick<DbSpace, 'space_uuid' | 'path'> &
    Pick<DbProject, 'project_uuid'> & {
        project_name: string;
        project_type: DbProject['project_type'];
    } & Pick<DbOrganization, 'organization_uuid'> & {
        updated_at: Date;
        spaceName: string;
        space_inherit_parent_permissions: boolean;
        dashboardName: string | null;
        created_by_user_uuid: string | null;
        created_by_user_first_name: string | null;
        created_by_user_last_name: string | null;
        last_version_updated_by_user_uuid: string | null;
        last_version_updated_by_user_first_name: string | null;
        last_version_updated_by_user_last_name: string | null;
    };

/**
 * Saved SQL charts are saved charts whose version carries a one-node pipeline
 * (the statement), so this model is an adapter over `SavedChartModel`: reads
 * rebuild the SQL runner shape from the pipeline chart, writes convert the
 * SQL runner shape to a pipeline chart. The `saved_sql` tables are only read
 * by `find`, for the promotion path that still compares upstream rows; the
 * previous release reads and writes them during a rolling update.
 */
export class SavedSqlModel {
    private database: Knex;

    private lightdashConfig: LightdashConfig;

    private savedChartModel: SavedChartModel;

    constructor(args: {
        database: Knex;
        lightdashConfig: LightdashConfig;
        savedChartModel: SavedChartModel;
    }) {
        this.database = args.database;
        this.lightdashConfig = args.lightdashConfig;
        this.savedChartModel = args.savedChartModel;
    }

    /**
     * SQL charts inherit-only — call `resolveColorPalette` without
     * `chartUuid` so the cascade skips the chart-level branch and seeds
     * from the dashboard / space.
     */
    async resolveColorPalette(args: {
        projectUuid: string;
        dashboardUuid?: string;
        spaceUuid?: string;
    }): Promise<ResolvedProjectColorPalette> {
        return resolveColorPalette({
            ...args,
            database: this.database,
            lightdashConfig: this.lightdashConfig,
        });
    }

    /** The SQL runner shape of a pipeline chart, or a NotFoundError when the chart is not a SQL chart. */
    static toSqlChart(chart: SavedChartDAO): Omit<
        SqlChart,
        'space' | 'resolvedColorPalette' | 'agentIdentity'
    > & {
        [storedVersionAgentIdentity]: AgentIdentityClaim | null;
        space: Pick<SpaceSummary, 'uuid' | 'name'>;
    } {
        if (!chart.pipeline) {
            throw new NotFoundError('Saved sql not found');
        }
        const sqlChart = convertPipelineChartToSqlChart({
            pipeline: chart.pipeline,
            chartConfig: chart.chartConfig,
            pivotConfig: chart.pivotConfig,
            tableConfig: chart.tableConfig,
            metricQuery: chart.metricQuery,
        });
        if (!sqlChart) {
            throw new NotFoundError('Saved sql not found');
        }
        const updatedBy = chart.updatedByUser
            ? {
                  userUuid: chart.updatedByUser.userUuid,
                  firstName: chart.updatedByUser.firstName,
                  lastName: chart.updatedByUser.lastName,
              }
            : null;
        return {
            savedSqlUuid: chart.uuid,
            [storedVersionAgentIdentity]: null,
            name: chart.name,
            description: chart.description ?? null,
            slug: chart.slug,
            createdAt: chart.createdAt ?? chart.updatedAt,
            createdBy: updatedBy,
            lastUpdatedAt: chart.updatedAt,
            lastUpdatedBy: updatedBy,
            sql: sqlChart.sql,
            limit: sqlChart.limit,
            config: sqlChart.config,
            chartKind: sqlChart.config.type,
            warehouseConnectionUuid: sqlChart.warehouseConnectionUuid,
            space: { uuid: chart.spaceUuid, name: chart.spaceName },
            project: {
                projectUuid: chart.projectUuid,
                name: chart.projectName,
                type: chart.projectType,
            },
            dashboard: chart.dashboardUuid
                ? {
                      uuid: chart.dashboardUuid,
                      name: chart.dashboardName ?? '',
                  }
                : null,
            organization: { organizationUuid: chart.organizationUuid },
            views: 0,
            firstViewedAt: chart.updatedAt,
            lastViewedAt: chart.updatedAt,
        };
    }

    static convertSelectSavedSql(row: SelectSavedSql): Omit<
        SqlChart,
        'space' | 'resolvedColorPalette' | 'agentIdentity'
    > & {
        [storedVersionAgentIdentity]: AgentIdentityClaim | null;
        space: Pick<SpaceSummary, 'uuid' | 'name'>;
    } {
        return {
            savedSqlUuid: row.saved_sql_uuid,
            [storedVersionAgentIdentity]: normalizeAgentIdentityClaim(
                row.agent_identity,
            ),
            name: row.name,
            description: row.description,
            slug: row.slug,
            createdAt: row.created_at,
            createdBy: row.created_by_user_uuid
                ? {
                      userUuid: row.created_by_user_uuid,
                      firstName: row.created_by_user_first_name ?? '',
                      lastName: row.created_by_user_last_name ?? '',
                  }
                : null,
            lastUpdatedAt: row.last_version_updated_at,
            lastUpdatedBy: row.last_version_updated_by_user_uuid
                ? {
                      userUuid: row.last_version_updated_by_user_uuid,
                      firstName:
                          row.last_version_updated_by_user_first_name ?? '',
                      lastName:
                          row.last_version_updated_by_user_last_name ?? '',
                  }
                : null,
            sql: row.sql,
            limit: row.limit,
            config: row.config as SqlChart['config'],
            chartKind: row.chart_kind,
            warehouseConnectionUuid: row.warehouse_connection_uuid,
            space: {
                uuid: row.space_uuid,
                name: row.spaceName,
            },
            project: {
                projectUuid: row.project_uuid,
                name: row.project_name,
                type: row.project_type,
            },
            dashboard: row.dashboard_uuid
                ? {
                      uuid: row.dashboard_uuid,
                      name: row.dashboardName ?? '',
                  }
                : null,
            organization: {
                organizationUuid: row.organization_uuid,
            },
            views: row.views_count,
            firstViewedAt: row.first_viewed_at || new Date(),
            lastViewedAt: row.last_viewed_at || new Date(),
        };
    }

    /**
     * Rows for the content as code and promotion paths that still read SQL
     * charts by slug or uuid. A listing (no slug, no uuid) is empty: SQL
     * charts are charts and come back with them.
     */
    private async findUuids(options: {
        uuid?: string;
        slugs?: string[];
        projectUuid?: string;
    }): Promise<string[]> {
        if (options.uuid) return [options.uuid];
        if (!options.slugs || options.slugs.length === 0) return [];
        const summaries = await this.savedChartModel.find({
            projectUuid: options.projectUuid,
            slugs: options.slugs,
            excludeChartsSavedInDashboard: false,
            includeOrphanChartsWithinDashboard: true,
        });
        return summaries.map((summary) => summary.uuid);
    }

    async find(options: {
        uuid?: string;
        slugs?: string[];
        projectUuid?: string;
        deleted?: boolean;
    }): Promise<SelectSavedSql[]> {
        const uuids = await this.findUuids(options);
        const charts = await Promise.all(
            uuids.map((uuid) =>
                this.savedChartModel
                    .get(uuid, undefined, {
                        projectUuid: options.projectUuid,
                        deleted: options.deleted,
                    })
                    .catch((error: unknown) => {
                        if (error instanceof NotFoundError) return null;
                        throw error;
                    }),
            ),
        );
        return charts.flatMap((chart) => {
            if (!chart?.pipeline) return [];
            const sqlChart = convertPipelineChartToSqlChart({
                pipeline: chart.pipeline,
                chartConfig: chart.chartConfig,
                pivotConfig: chart.pivotConfig,
                tableConfig: chart.tableConfig,
                metricQuery: chart.metricQuery,
            });
            if (!sqlChart) return [];
            return [
                {
                    saved_sql_uuid: chart.uuid,
                    name: chart.name,
                    description: chart.description ?? null,
                    slug: chart.slug,
                    dashboard_uuid: chart.dashboardUuid,
                    created_at: chart.createdAt ?? chart.updatedAt,
                    last_version_updated_at: chart.updatedAt,
                    views_count: 0,
                    first_viewed_at: null,
                    last_viewed_at: null,
                    saved_sql_version_uuid: '',
                    sql: sqlChart.sql,
                    limit: sqlChart.limit,
                    config: sqlChart.config,
                    chart_kind: sqlChart.config.type,
                    agent_identity: null,
                    warehouse_connection_uuid: sqlChart.warehouseConnectionUuid,
                    space_uuid: chart.spaceUuid,
                    path: '',
                    project_uuid: chart.projectUuid,
                    project_name: chart.projectName ?? '',
                    project_type: chart.projectType ?? ProjectType.DEFAULT,
                    organization_uuid: chart.organizationUuid,
                    updated_at: chart.updatedAt,
                    spaceName: chart.spaceName,
                    space_inherit_parent_permissions: true,
                    dashboardName: chart.dashboardName ?? null,
                    created_by_user_uuid: chart.updatedByUser?.userUuid ?? null,
                    created_by_user_first_name:
                        chart.updatedByUser?.firstName ?? null,
                    created_by_user_last_name:
                        chart.updatedByUser?.lastName ?? null,
                    last_version_updated_by_user_uuid:
                        chart.updatedByUser?.userUuid ?? null,
                    last_version_updated_by_user_first_name:
                        chart.updatedByUser?.firstName ?? null,
                    last_version_updated_by_user_last_name:
                        chart.updatedByUser?.lastName ?? null,
                },
            ];
        });
    }

    async getBySlug(
        projectUuid: string,
        slug: string,
        options?: { deleted?: boolean },
    ) {
        const chart = await this.savedChartModel.get(slug, undefined, {
            projectUuid,
            deleted: options?.deleted,
        });
        return SavedSqlModel.toSqlChart(chart);
    }

    async getByUuid(
        uuid: string,
        options?: { projectUuid?: string; deleted?: boolean },
    ) {
        const chart = await this.savedChartModel.get(uuid, undefined, options);
        return SavedSqlModel.toSqlChart(chart);
    }

    /** The version a SQL runner chart creates: the pipeline chart its config converts to. */
    private static toChartVersion(
        data: {
            config: AllVizChartConfig;
            sql: string;
            limit: number;
        },
        warehouseConnectionUuid: string | null,
    ): CreateSavedChartVersion {
        const converted = convertSqlChartToPipelineChart({
            sql: data.sql,
            limit: data.limit,
            config: data.config,
            warehouseConnectionUuid,
        });
        return {
            tableName: converted.tableName,
            metricQuery: converted.metricQuery,
            chartConfig: converted.chartConfig,
            pivotConfig: converted.pivotConfig,
            tableConfig: converted.tableConfig,
            pipeline: converted.pipeline,
        };
    }

    private async resolveConnection(
        savedSqlUuid: string | null,
        binding: SqlChartVersionBinding | undefined,
    ): Promise<string | null> {
        if (binding?.kind === 'connection') {
            return binding.warehouseConnectionUuid;
        }
        if (binding?.kind === 'latest' && savedSqlUuid) {
            const current = await this.getByUuid(savedSqlUuid);
            return current.warehouseConnectionUuid;
        }
        return null;
    }

    async create(
        userUuid: string,
        projectUuid: string,
        data: CreateSqlChart,
        binding?: SqlChartConnectionBinding,
        // 'unique' treats data.slug as a base and appends -1, -2… on conflict.
        { slugMode }: { slugMode: 'exact' | 'unique' } = { slugMode: 'exact' },
        agentIdentity: AgentIdentityClaim | null = null,
        onVersionCreated?: OnContentVersionCreated,
    ): Promise<{
        savedSqlUuid: string;
        slug: string;
        savedSqlVersionUuid: string;
    }> {
        const version = SavedSqlModel.toChartVersion(
            data,
            binding?.warehouseConnectionUuid ?? null,
        );
        const chart = await this.savedChartModel.create(
            projectUuid,
            userUuid,
            {
                ...version,
                name: data.name,
                description: data.description ?? undefined,
                spaceUuid: data.spaceUuid,
                dashboardUuid: null,
                slug: data.slug ?? generateSlug(data.name),
                forceSlug: data.slug !== undefined && slugMode === 'exact',
                updatedByUser: { userUuid, firstName: '', lastName: '' },
            },
            agentIdentity,
            onVersionCreated,
        );
        const latest = await this.savedChartModel.getLatestVersionSummary(
            chart.uuid,
        );
        return {
            savedSqlUuid: chart.uuid,
            slug: chart.slug,
            savedSqlVersionUuid: latest?.versionUuid ?? '',
        };
    }

    async update(
        data: {
            userUuid: string;
            savedSqlUuid: string;
            sqlChart: UpdateSqlChart;
        },
        binding?: SqlChartVersionBinding,
        agentIdentity: AgentIdentityClaim | null = null,
        onVersionCreated?: OnContentVersionCreated,
    ): Promise<{ savedSqlUuid: string; savedSqlVersionUuid: string | null }> {
        if (data.sqlChart.unversionedData) {
            await this.savedChartModel.update(data.savedSqlUuid, {
                name: data.sqlChart.unversionedData.name,
                description:
                    data.sqlChart.unversionedData.description ?? undefined,
                spaceUuid: data.sqlChart.unversionedData.spaceUuid,
            });
        }
        let savedSqlVersionUuid: string | null = null;
        if (data.sqlChart.versionedData) {
            const connection = await this.resolveConnection(
                data.savedSqlUuid,
                binding,
            );
            await this.savedChartModel.createVersion(
                data.savedSqlUuid,
                SavedSqlModel.toChartVersion(
                    data.sqlChart.versionedData,
                    connection,
                ),
                { userUuid: data.userUuid } as SessionUser,
                undefined,
                undefined,
                agentIdentity,
                onVersionCreated,
            );
            const latest = await this.savedChartModel.getLatestVersionSummary(
                data.savedSqlUuid,
            );
            savedSqlVersionUuid = latest?.versionUuid ?? null;
        } else {
            await onVersionCreated?.(
                this.database as Knex.Transaction,
                null,
                data.savedSqlUuid,
            );
        }
        return { savedSqlUuid: data.savedSqlUuid, savedSqlVersionUuid };
    }

    async delete(uuid: string) {
        await this.savedChartModel.permanentDelete(uuid);
    }

    async softDelete(savedSqlUuid: string, userUuid: string): Promise<void> {
        await this.savedChartModel.softDelete(savedSqlUuid, userUuid);
        await cancelPendingContentReviewRequests(
            this.database,
            ContentReviewContentType.SQL_CHART,
            [savedSqlUuid],
        );
    }

    async restore(savedSqlUuid: string): Promise<void> {
        await this.savedChartModel.restore(savedSqlUuid);
    }

    async permanentDelete(savedSqlUuid: string): Promise<void> {
        await this.savedChartModel.permanentDelete(savedSqlUuid);
    }

    async moveToSpace(
        args: {
            projectUuid: string;
            itemUuid: string;
            targetSpaceUuid: string | null;
        },
        options: { tx?: Knex } = {},
    ): Promise<void> {
        await this.savedChartModel.moveToSpace(args, options);
    }
}
