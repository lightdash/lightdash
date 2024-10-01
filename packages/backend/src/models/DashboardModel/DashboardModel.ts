import {
    assertUnreachable,
    CreateDashboard,
    CreateDashboardChartTile,
    CreateDashboardLoomTile,
    CreateDashboardMarkdownTile,
    CreateDashboardSemanticViewerChartTile,
    CreateDashboardSqlChartTile,
    DashboardBasicDetails,
    DashboardChartTile,
    DashboardDAO,
    DashboardLoomTile,
    DashboardMarkdownTile,
    DashboardSemanticViewerChartTile,
    DashboardSqlChartTile,
    DashboardTab,
    DashboardTileTypes,
    DashboardUnversionedFields,
    DashboardVersionedFields,
    HTML_SANITIZE_MARKDOWN_TILE_RULES,
    isDashboardChartTileType,
    isDashboardLoomTileType,
    isDashboardMarkdownTileType,
    isDashboardSemanticViewerChartTile,
    isDashboardSqlChartTile,
    LightdashUser,
    NotFoundError,
    sanitizeHtml,
    SavedChart,
    SessionUser,
    UnexpectedServerError,
    UpdateMultipleDashboards,
    type DashboardBasicDetailsWithTileTypes,
    type DashboardFilters,
} from '@lightdash/common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import {
    DashboardsTableName,
    DashboardTable,
    DashboardTabsTableName,
    DashboardTileChartTable,
    DashboardTileChartTableName,
    DashboardTileLoomsTableName,
    DashboardTileMarkdownsTableName,
    DashboardTileSemanticViewerChartTableName,
    DashboardTileSqlChartTableName,
    DashboardTilesTableName,
    DashboardVersionsTableName,
    DashboardVersionTable,
    DashboardViewsTableName,
} from '../../database/entities/dashboards';
import {
    OrganizationTable,
    OrganizationTableName,
} from '../../database/entities/organizations';
import {
    PinnedDashboardTable,
    PinnedDashboardTableName,
    PinnedListTable,
    PinnedListTableName,
} from '../../database/entities/pinnedList';
import {
    ProjectTable,
    ProjectTableName,
} from '../../database/entities/projects';
import {
    SavedChartsTableName,
    SavedChartTable,
} from '../../database/entities/savedCharts';
import { SavedSemanticViewerChartsTableName } from '../../database/entities/savedSemanticViewerCharts';
import { SavedSqlTableName } from '../../database/entities/savedSql';
import { SpaceTableName } from '../../database/entities/spaces';
import { UserTable, UserTableName } from '../../database/entities/users';
import { DbValidationTable } from '../../database/entities/validation';
import { generateUniqueSlug } from '../../utils/SlugUtils';
import { SpaceModel } from '../SpaceModel';
import Transaction = Knex.Transaction;

export type GetDashboardQuery = Pick<
    DashboardTable['base'],
    | 'dashboard_id'
    | 'dashboard_uuid'
    | 'name'
    | 'description'
    | 'slug'
    | 'views_count'
    | 'first_viewed_at'
> &
    Pick<DashboardVersionTable['base'], 'dashboard_version_id' | 'created_at'> &
    Pick<ProjectTable['base'], 'project_uuid'> &
    Pick<UserTable['base'], 'user_uuid' | 'first_name' | 'last_name'> &
    Pick<OrganizationTable['base'], 'organization_uuid'> &
    Pick<PinnedListTable['base'], 'pinned_list_uuid'> &
    Pick<PinnedDashboardTable['base'], 'order'>;

export type GetDashboardDetailsQuery = Pick<
    DashboardTable['base'],
    | 'dashboard_uuid'
    | 'name'
    | 'description'
    | 'views_count'
    | 'first_viewed_at'
> &
    Pick<DashboardVersionTable['base'], 'created_at'> &
    Pick<ProjectTable['base'], 'project_uuid'> &
    Pick<UserTable['base'], 'user_uuid' | 'first_name' | 'last_name'> &
    Pick<OrganizationTable['base'], 'organization_uuid'> &
    Pick<PinnedListTable['base'], 'pinned_list_uuid'> &
    Pick<PinnedDashboardTable['base'], 'order'>;

export type GetChartTileQuery = Pick<
    DashboardTileChartTable['base'],
    'dashboard_tile_uuid'
> &
    Pick<SavedChartTable['base'], 'saved_query_uuid'>;

type DashboardModelArguments = {
    database: Knex;
};

export class DashboardModel {
    private readonly database: Knex;

    constructor(args: DashboardModelArguments) {
        this.database = args.database;
    }

    private static async createVersion(
        trx: Transaction,
        dashboardId: number,
        version: DashboardVersionedFields,
    ): Promise<void> {
        const [versionId] = await trx(DashboardVersionsTableName).insert(
            {
                dashboard_id: dashboardId,
                updated_by_user_uuid: version.updatedByUser?.userUuid,
            },
            ['dashboard_version_id', 'updated_by_user_uuid'],
        );

        await trx(DashboardViewsTableName).insert({
            dashboard_version_id: versionId.dashboard_version_id,
            name: 'Default',
            filters: version.filters || {
                dimensions: [],
                metrics: [],
                tableCalculations: [],
            },
        });

        if (version.tabs.length > 0) {
            await trx(DashboardTabsTableName).insert(
                version.tabs.map((tab) => ({
                    dashboard_version_id: versionId.dashboard_version_id,
                    name: tab.name,
                    uuid: tab.uuid,
                    dashboard_id: dashboardId,
                    order: tab.order,
                })),
            );
        }

        const tilesWithUuids: Array<
            | (CreateDashboardChartTile & { uuid: string })
            | (CreateDashboardMarkdownTile & { uuid: string })
            | (CreateDashboardLoomTile & { uuid: string })
            | (CreateDashboardSqlChartTile & { uuid: string })
            | (CreateDashboardSemanticViewerChartTile & { uuid: string })
        > = version.tiles.map((tile) => ({
            ...tile,
            uuid: tile.uuid || uuidv4(),
        }));

        if (tilesWithUuids.length > 0) {
            await trx(DashboardTilesTableName).insert(
                tilesWithUuids.map(({ uuid, type, w, h, x, y, tabUuid }) => ({
                    dashboard_version_id: versionId.dashboard_version_id,
                    dashboard_tile_uuid: uuid,
                    type,
                    height: h,
                    width: w,
                    x_offset: x,
                    y_offset: y,
                    tab_uuid: tabUuid,
                })),
            );
        }

        const chartTiles = tilesWithUuids.filter(isDashboardChartTileType);
        if (chartTiles.length > 0) {
            const chartIds = await trx(SavedChartsTableName)
                .select(['saved_query_id', 'saved_query_uuid'])
                .whereIn(
                    'saved_query_uuid',
                    chartTiles.map(
                        ({ properties }) => properties.savedChartUuid,
                    ),
                );

            const getChartId = (savedChartUuid: string): number => {
                const matchingChartId = chartIds.find(
                    (chart) => chart.saved_query_uuid === savedChartUuid,
                )?.saved_query_id;
                if (matchingChartId === undefined) {
                    throw new NotFoundError('Saved chart not found');
                }
                return matchingChartId;
            };

            await trx(DashboardTileChartTableName).insert(
                tilesWithUuids
                    .filter(isDashboardChartTileType)
                    .map(({ uuid, properties }) => ({
                        dashboard_version_id: versionId.dashboard_version_id,
                        dashboard_tile_uuid: uuid,
                        saved_chart_id: properties.savedChartUuid
                            ? getChartId(properties.savedChartUuid)
                            : null,
                        hide_title: properties.hideTitle,
                        title: properties.title,
                    })),
            );
        }

        const loomTiles = tilesWithUuids.filter(isDashboardLoomTileType);
        if (loomTiles.length > 0) {
            await trx(DashboardTileLoomsTableName).insert(
                loomTiles.map(({ uuid, properties }) => ({
                    dashboard_version_id: versionId.dashboard_version_id,
                    dashboard_tile_uuid: uuid,
                    title: properties.title,
                    url: properties.url,
                    hide_title: properties.hideTitle,
                })),
            );
        }

        const markdownTiles = tilesWithUuids.filter(
            isDashboardMarkdownTileType,
        );
        if (markdownTiles.length > 0) {
            await trx(DashboardTileMarkdownsTableName).insert(
                markdownTiles.map(({ uuid, properties }) => ({
                    dashboard_version_id: versionId.dashboard_version_id,
                    dashboard_tile_uuid: uuid,
                    title: properties.title,
                    content: sanitizeHtml(
                        properties.content,
                        HTML_SANITIZE_MARKDOWN_TILE_RULES,
                    ),
                })),
            );
        }

        const sqlChartTiles = tilesWithUuids.filter(isDashboardSqlChartTile);
        if (sqlChartTiles.length > 0) {
            await trx(DashboardTileSqlChartTableName).insert(
                sqlChartTiles.map(({ uuid, properties }) => ({
                    dashboard_version_id: versionId.dashboard_version_id,
                    dashboard_tile_uuid: uuid,
                    saved_sql_uuid: properties.savedSqlUuid,
                    hide_title: properties.hideTitle,
                    title: properties.title,
                })),
            );
        }

        const semanticViewerChartTiles = tilesWithUuids.filter(
            isDashboardSemanticViewerChartTile,
        );
        if (semanticViewerChartTiles.length > 0) {
            await trx(DashboardTileSemanticViewerChartTableName).insert(
                semanticViewerChartTiles.map(({ uuid, properties }) => ({
                    dashboard_version_id: versionId.dashboard_version_id,
                    dashboard_tile_uuid: uuid,
                    saved_semantic_viewer_chart_uuid:
                        properties.savedSemanticViewerChartUuid,
                    hide_title: properties.hideTitle,
                    title: properties.title,
                })),
            );
        }

        const tileUuids = tilesWithUuids.map((tile) => tile.uuid);

        // TODO: remove after resolving a problem with importing lodash-es in the backend
        const pick = <T>(object: Record<string, T>, keys: string[]) =>
            Object.keys(object)
                .filter((key) => keys.includes(key))
                .reduce<typeof object>(
                    (obj, key) => ({ ...obj, [key]: object[key] }),
                    {},
                );

        await trx(DashboardViewsTableName)
            .update({
                filters: {
                    dimensions:
                        version.filters?.dimensions.map((filter) => ({
                            ...filter,
                            tileTargets: filter.tileTargets
                                ? pick(filter.tileTargets, tileUuids)
                                : undefined,
                        })) ?? [],
                    metrics:
                        version.filters?.metrics.map((filter) => ({
                            ...filter,
                            tileTargets: filter.tileTargets
                                ? pick(filter.tileTargets, tileUuids)
                                : undefined,
                        })) ?? [],
                    tableCalculations:
                        version.filters?.tableCalculations.map((filter) => ({
                            ...filter,
                            tileTargets: filter.tileTargets
                                ? pick(filter.tileTargets, tileUuids)
                                : undefined,
                        })) ?? [],
                },
            })
            .where({ dashboard_version_id: versionId.dashboard_version_id });
    }

    // TODO: This can be removed once we can have a semantic layer as a project connection
    private async getDashboardVersionTileTypes(dashboardVersionId: number) {
        const tileTypes = await this.database(DashboardTilesTableName)
            .select<
                {
                    type: DashboardTileTypes;
                }[]
            >(`${DashboardTilesTableName}.type`)
            .where(
                `${DashboardTilesTableName}.dashboard_version_id`,
                dashboardVersionId,
            )
            .distinctOn(`${DashboardTilesTableName}.type`);

        return tileTypes.map((t) => t.type);
    }

    async getAllByProject(
        projectUuid: string,
        chartUuid?: string,
    ): Promise<DashboardBasicDetailsWithTileTypes[]> {
        const cteTableName = 'cte';
        const dashboardsQuery = this.database
            .with(cteTableName, (queryBuilder) => {
                void queryBuilder
                    .table(DashboardsTableName)
                    .leftJoin(
                        DashboardVersionsTableName,
                        `${DashboardsTableName}.dashboard_id`,
                        `${DashboardVersionsTableName}.dashboard_id`,
                    )
                    .leftJoin(
                        SpaceTableName,
                        `${DashboardsTableName}.space_id`,
                        `${SpaceTableName}.space_id`,
                    )
                    .leftJoin(
                        UserTableName,
                        `${UserTableName}.user_uuid`,
                        `${DashboardVersionsTableName}.updated_by_user_uuid`,
                    )
                    .innerJoin(
                        ProjectTableName,
                        `${SpaceTableName}.project_id`,
                        `${ProjectTableName}.project_id`,
                    )
                    .innerJoin(
                        OrganizationTableName,
                        `${ProjectTableName}.organization_id`,
                        `${OrganizationTableName}.organization_id`,
                    )
                    .leftJoin(
                        PinnedDashboardTableName,
                        `${PinnedDashboardTableName}.dashboard_uuid`,
                        `${DashboardsTableName}.dashboard_uuid`,
                    )
                    .leftJoin(
                        PinnedListTableName,
                        `${PinnedListTableName}.pinned_list_uuid`,
                        `${PinnedDashboardTableName}.pinned_list_uuid`,
                    )
                    .select<GetDashboardDetailsQuery[]>([
                        `${DashboardsTableName}.dashboard_uuid`,
                        `${DashboardsTableName}.name`,
                        `${DashboardsTableName}.description`,
                        `${DashboardVersionsTableName}.created_at`,
                        `${DashboardVersionsTableName}.dashboard_version_id`,
                        `${ProjectTableName}.project_uuid`,
                        `${UserTableName}.user_uuid`,
                        `${UserTableName}.first_name`,
                        `${UserTableName}.last_name`,
                        `${OrganizationTableName}.organization_uuid`,
                        `${SpaceTableName}.space_uuid`,
                        `${PinnedListTableName}.pinned_list_uuid`,
                        `${PinnedDashboardTableName}.order`,
                        `${DashboardsTableName}.views_count`,
                        `${DashboardsTableName}.first_viewed_at`,
                        this.database.raw(`
                            COALESCE(
                                (
                                    SELECT json_agg(validations.*)
                                    FROM validations
                                    WHERE validations.dashboard_uuid = ${DashboardsTableName}.dashboard_uuid
                                    AND validations.job_id IS NULL
                                ), '[]'
                            ) as validation_errors
                        `),
                    ])
                    .orderBy([
                        {
                            column: `${DashboardVersionsTableName}.dashboard_id`,
                        },
                        {
                            column: `${DashboardVersionsTableName}.created_at`,
                            order: 'desc',
                        },
                    ])
                    .distinctOn(`${DashboardVersionsTableName}.dashboard_id`)
                    .where(`${ProjectTableName}.project_uuid`, projectUuid);
            })
            .select(`${cteTableName}.*`);

        if (chartUuid) {
            void dashboardsQuery
                .leftJoin(
                    DashboardTilesTableName,
                    `${DashboardTilesTableName}.dashboard_version_id`,
                    `${cteTableName}.dashboard_version_id`,
                )
                .leftJoin(
                    DashboardTileChartTableName,
                    function joinDashboardTileChartTableName() {
                        this.on(
                            `${DashboardTileChartTableName}.dashboard_version_id`,
                            '=',
                            `${DashboardTilesTableName}.dashboard_version_id`,
                        );
                        this.andOn(
                            `${DashboardTileChartTableName}.dashboard_tile_uuid`,
                            '=',
                            `${DashboardTilesTableName}.dashboard_tile_uuid`,
                        );
                    },
                )
                .leftJoin(
                    SavedChartsTableName,
                    `${SavedChartsTableName}.saved_query_id`,
                    `${DashboardTileChartTableName}.saved_chart_id`,
                )
                .distinctOn(`${cteTableName}.dashboard_uuid`)
                .andWhere(
                    `${SavedChartsTableName}.saved_query_uuid`,
                    chartUuid,
                );
        }
        const dashboards = await dashboardsQuery.from(cteTableName);

        return Promise.all(
            dashboards.map(
                async ({
                    name,
                    description,
                    dashboard_uuid,
                    created_at,
                    project_uuid,
                    user_uuid,
                    first_name,
                    last_name,
                    organization_uuid,
                    space_uuid,
                    pinned_list_uuid,
                    order,
                    views_count,
                    first_viewed_at,
                    validation_errors,
                    dashboard_version_id,
                }) => {
                    // TODO: This can be removed once we can have a semantic layer as a project connection
                    const tileTypes = await this.getDashboardVersionTileTypes(
                        dashboard_version_id,
                    );

                    return {
                        organizationUuid: organization_uuid,
                        name,
                        description,
                        uuid: dashboard_uuid,
                        updatedAt: created_at,
                        projectUuid: project_uuid,
                        updatedByUser: {
                            userUuid: user_uuid,
                            firstName: first_name,
                            lastName: last_name,
                        },
                        spaceUuid: space_uuid,
                        pinnedListUuid: pinned_list_uuid,
                        pinnedListOrder: order,
                        views: views_count,
                        firstViewedAt: first_viewed_at,
                        validationErrors: validation_errors?.map(
                            (error: DbValidationTable) => ({
                                validationId: error.validation_id,
                                error: error.error,
                                createdAt: error.created_at,
                            }),
                        ),
                        tileTypes,
                    };
                },
            ),
        );
    }

    async findDashboardsForValidation(projectUuid: string): Promise<
        Array<{
            dashboardUuid: string;
            name: string;
            filters: DashboardFilters;
            chartUuids: string[];
        }>
    > {
        const cteName = 'dashboard_last_version_cte';
        return (
            this.database
                // cte to get the last version of each dashboard in the project
                .with(cteName, (qb) => {
                    void qb
                        .select({
                            dashboard_uuid: 'dashboards.dashboard_uuid',
                            name: 'dashboards.name',
                            dashboard_version_id: this.database.raw(
                                'MAX(dashboard_versions.dashboard_version_id)',
                            ),
                        })
                        .from(DashboardsTableName)
                        .leftJoin(
                            SpaceTableName,
                            'dashboards.space_id',
                            'spaces.space_id',
                        )
                        .leftJoin(
                            ProjectTableName,
                            'spaces.project_id',
                            'projects.project_id',
                        )
                        .leftJoin(
                            DashboardVersionsTableName,
                            `${DashboardsTableName}.dashboard_id`,
                            `${DashboardVersionsTableName}.dashboard_id`,
                        )
                        .where('projects.project_uuid', projectUuid)
                        .groupBy(
                            'dashboards.dashboard_uuid',
                            'dashboards.name',
                        );
                })
                .select({
                    dashboardUuid: `${cteName}.dashboard_uuid`,
                    name: `${cteName}.name`,
                    filters: `${DashboardViewsTableName}.filters`,
                    chartUuids: this.database.raw(
                        "COALESCE(ARRAY_AGG(DISTINCT saved_queries.saved_query_uuid) FILTER (WHERE saved_queries.saved_query_uuid IS NOT NULL), '{}')",
                    ),
                })
                .from(cteName)
                .leftJoin(
                    DashboardViewsTableName,
                    `${cteName}.dashboard_version_id`,
                    `${DashboardViewsTableName}.dashboard_version_id`,
                )
                .leftJoin(
                    DashboardTileChartTableName,
                    `${cteName}.dashboard_version_id`,
                    `${DashboardTileChartTableName}.dashboard_version_id`,
                )
                .leftJoin(
                    SavedChartsTableName,
                    `${DashboardTileChartTableName}.saved_chart_id`,
                    `${SavedChartsTableName}.saved_query_id`,
                )
                .groupBy(1, 2, 3)
        );
    }

    async find({
        slug,
        projectUuid,
    }: {
        projectUuid?: string;
        slug?: string;
    }): Promise<
        Pick<DashboardDAO, 'uuid' | 'name' | 'spaceUuid' | 'description'>[]
    > {
        const query = this.database(DashboardsTableName).select(
            `${DashboardsTableName}.name`,
            `${DashboardsTableName}.dashboard_uuid`,
            `${SpaceTableName}.space_uuid`,
            `${DashboardsTableName}.description`,
        );

        if (projectUuid) {
            void query
                .innerJoin(SpaceTableName, function spaceJoin() {
                    this.on(
                        `${SpaceTableName}.space_id`,
                        '=',
                        `${DashboardsTableName}.space_id`,
                    );
                })
                .leftJoin(
                    'projects',
                    'spaces.project_id',
                    'projects.project_id',
                )
                .where('projects.project_uuid', projectUuid);
        }

        if (slug) {
            void query.where(`${DashboardsTableName}.slug`, slug);
        }

        const dashboards = await query;

        return dashboards.map(
            ({ name, dashboard_uuid, space_uuid, description }) => ({
                name,
                description,
                uuid: dashboard_uuid,
                spaceUuid: space_uuid,
            }),
        );
    }

    async getById(dashboardUuid: string): Promise<DashboardDAO> {
        const [dashboard] = await this.database(DashboardsTableName)
            .leftJoin(
                DashboardVersionsTableName,
                `${DashboardsTableName}.dashboard_id`,
                `${DashboardVersionsTableName}.dashboard_id`,
            )
            .leftJoin(
                UserTableName,
                `${DashboardVersionsTableName}.updated_by_user_uuid`,
                `${UserTableName}.user_uuid`,
            )
            .leftJoin(
                SpaceTableName,
                `${DashboardsTableName}.space_id`,
                `${SpaceTableName}.space_id`,
            )
            .leftJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .leftJoin(
                OrganizationTableName,
                `${OrganizationTableName}.organization_id`,
                `${ProjectTableName}.organization_id`,
            )
            .leftJoin(
                PinnedDashboardTableName,
                `${PinnedDashboardTableName}.dashboard_uuid`,
                `${DashboardsTableName}.dashboard_uuid`,
            )
            .leftJoin(
                PinnedListTableName,
                `${PinnedListTableName}.pinned_list_uuid`,
                `${PinnedDashboardTableName}.pinned_list_uuid`,
            )
            .select<
                (GetDashboardQuery & {
                    space_uuid: string;
                    space_name: string;
                })[]
            >([
                `${ProjectTableName}.project_uuid`,
                `${DashboardsTableName}.dashboard_id`,
                `${DashboardsTableName}.dashboard_uuid`,
                `${DashboardsTableName}.name`,
                `${DashboardsTableName}.description`,
                `${DashboardsTableName}.slug`,
                `${DashboardVersionsTableName}.dashboard_version_id`,
                `${DashboardVersionsTableName}.created_at`,
                `${UserTableName}.user_uuid`,
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
                `${OrganizationTableName}.organization_uuid`,
                `${SpaceTableName}.space_uuid`,
                `${SpaceTableName}.name as space_name`,
                `${PinnedListTableName}.pinned_list_uuid`,
                `${PinnedDashboardTableName}.order`,
                `${DashboardsTableName}.views_count`,
                `${DashboardsTableName}.first_viewed_at`,
            ])
            .where(`${DashboardsTableName}.dashboard_uuid`, dashboardUuid)
            .orderBy(`${DashboardVersionsTableName}.created_at`, 'desc')
            .limit(1);

        if (!dashboard) {
            throw new NotFoundError('Dashboard not found');
        }

        const [view] = await this.database(DashboardViewsTableName)
            .select('*')
            .orderBy(`${DashboardViewsTableName}.created_at`, 'desc')
            .where(`dashboard_version_id`, dashboard.dashboard_version_id);

        const tiles = await this.database(DashboardTilesTableName)
            .select<
                {
                    x_offset: number;
                    y_offset: number;
                    type: DashboardTileTypes;
                    width: number;
                    height: number;
                    dashboard_tile_uuid: string;
                    saved_query_uuid: string | null;
                    saved_sql_uuid: string | null;
                    saved_semantic_viewer_chart_uuid: string | null;
                    url: string | null;
                    content: string | null;
                    hide_title: boolean | null;
                    title: string | null;
                    views_count: string;
                    first_viewed_at: Date | null;
                    belongs_to_dashboard: boolean;
                    name: string | null;
                    last_version_chart_kind: string | null;
                    tab_uuid: string;
                }[]
            >(
                `${DashboardTilesTableName}.x_offset`,
                `${DashboardTilesTableName}.y_offset`,
                `${DashboardTilesTableName}.type`,
                `${DashboardTilesTableName}.width`,
                `${DashboardTilesTableName}.height`,
                `${DashboardTilesTableName}.dashboard_tile_uuid`,
                `${DashboardTilesTableName}.tab_uuid`,
                `${SavedChartsTableName}.saved_query_uuid`,
                this.database.raw(
                    ` COALESCE(
                        ${SavedChartsTableName}.name,
                        ${SavedSqlTableName}.name,
                        ${SavedSemanticViewerChartsTableName}.name
                    ) AS name`,
                ),
                `${SavedChartsTableName}.last_version_chart_kind`,
                `${DashboardTileSqlChartTableName}.saved_sql_uuid`,
                `${DashboardTileSemanticViewerChartTableName}.saved_semantic_viewer_chart_uuid`,
                this.database.raw(
                    `${SavedChartsTableName}.dashboard_uuid IS NOT NULL AS belongs_to_dashboard`,
                ),
                this.database.raw(
                    `COALESCE(
                        ${DashboardTileChartTableName}.title,
                        ${DashboardTileLoomsTableName}.title,
                        ${DashboardTileMarkdownsTableName}.title,
                        ${DashboardTileSqlChartTableName}.title,
                        ${DashboardTileSemanticViewerChartTableName}.title
                    ) AS title`,
                ),
                this.database.raw(
                    `COALESCE(
                        ${DashboardTileLoomsTableName}.hide_title,
                        ${DashboardTileChartTableName}.hide_title,
                        ${DashboardTileSqlChartTableName}.hide_title,
                        ${DashboardTileSemanticViewerChartTableName}.hide_title
                    ) AS hide_title`,
                ),
                `${DashboardTileLoomsTableName}.url`,
                `${DashboardTileMarkdownsTableName}.content`,
            )
            .leftJoin(DashboardTileChartTableName, function chartsJoin() {
                this.on(
                    `${DashboardTileChartTableName}.dashboard_tile_uuid`,
                    '=',
                    `${DashboardTilesTableName}.dashboard_tile_uuid`,
                );
                this.andOn(
                    `${DashboardTileChartTableName}.dashboard_version_id`,
                    '=',
                    `${DashboardTilesTableName}.dashboard_version_id`,
                );
            })
            .leftJoin(DashboardTileSqlChartTableName, function sqlChartsJoin() {
                this.on(
                    `${DashboardTileSqlChartTableName}.dashboard_tile_uuid`,
                    '=',
                    `${DashboardTilesTableName}.dashboard_tile_uuid`,
                );
                this.andOn(
                    `${DashboardTileSqlChartTableName}.dashboard_version_id`,
                    '=',
                    `${DashboardTilesTableName}.dashboard_version_id`,
                );
            })
            .leftJoin(
                DashboardTileSemanticViewerChartTableName,
                function semanticViewerChartsJoin() {
                    this.on(
                        `${DashboardTileSemanticViewerChartTableName}.dashboard_tile_uuid`,
                        '=',
                        `${DashboardTilesTableName}.dashboard_tile_uuid`,
                    );
                    this.andOn(
                        `${DashboardTileSemanticViewerChartTableName}.dashboard_version_id`,
                        '=',
                        `${DashboardTilesTableName}.dashboard_version_id`,
                    );
                },
            )
            .leftJoin(DashboardTileLoomsTableName, function loomsJoin() {
                this.on(
                    `${DashboardTileLoomsTableName}.dashboard_tile_uuid`,
                    '=',
                    `${DashboardTilesTableName}.dashboard_tile_uuid`,
                );
                this.andOn(
                    `${DashboardTileLoomsTableName}.dashboard_version_id`,
                    '=',
                    `${DashboardTilesTableName}.dashboard_version_id`,
                );
            })
            .leftJoin(DashboardTileMarkdownsTableName, function markdownJoin() {
                this.on(
                    `${DashboardTileMarkdownsTableName}.dashboard_tile_uuid`,
                    '=',
                    `${DashboardTilesTableName}.dashboard_tile_uuid`,
                );
                this.andOn(
                    `${DashboardTileMarkdownsTableName}.dashboard_version_id`,
                    '=',
                    `${DashboardTilesTableName}.dashboard_version_id`,
                );
            })
            .leftJoin(
                SavedSqlTableName,
                `${DashboardTileSqlChartTableName}.saved_sql_uuid`,
                `${SavedSqlTableName}.saved_sql_uuid`,
            )
            .leftJoin(
                SavedSemanticViewerChartsTableName,
                `${DashboardTileSemanticViewerChartTableName}.saved_semantic_viewer_chart_uuid`,
                `${SavedSemanticViewerChartsTableName}.saved_semantic_viewer_chart_uuid`,
            )
            .leftJoin(
                SavedChartsTableName,
                `${DashboardTileChartTableName}.saved_chart_id`,
                `${SavedChartsTableName}.saved_query_id`,
            )
            .where(
                `${DashboardTilesTableName}.dashboard_version_id`,
                dashboard.dashboard_version_id,
            );

        const tabs = await this.database(DashboardTabsTableName)
            .select<DashboardTab[]>(
                `${DashboardTabsTableName}.name`,
                `${DashboardTabsTableName}.uuid`,
                `${DashboardTabsTableName}.order`,
            )
            .where(
                `${DashboardTabsTableName}.dashboard_version_id`,
                dashboard.dashboard_version_id,
            )
            .andWhere(
                `${DashboardTabsTableName}.dashboard_id`,
                dashboard.dashboard_id,
            );

        const tableCalculationFilters = view?.filters?.tableCalculations;
        view.filters.tableCalculations = tableCalculationFilters || [];

        return {
            organizationUuid: dashboard.organization_uuid,
            projectUuid: dashboard.project_uuid,
            dashboardVersionId: dashboard.dashboard_version_id,
            uuid: dashboard.dashboard_uuid,
            name: dashboard.name,
            description: dashboard.description,
            updatedAt: dashboard.created_at,
            pinnedListUuid: dashboard.pinned_list_uuid,
            pinnedListOrder: dashboard.order,
            tiles: tiles.map(
                ({
                    type,
                    height,
                    width,
                    x_offset,
                    y_offset,
                    dashboard_tile_uuid,
                    saved_query_uuid,
                    saved_sql_uuid,
                    saved_semantic_viewer_chart_uuid,
                    title,
                    hide_title,
                    url,
                    content,
                    belongs_to_dashboard,
                    name,
                    last_version_chart_kind,
                    tab_uuid,
                }) => {
                    const base: Omit<
                        DashboardDAO['tiles'][number],
                        'type' | 'properties'
                    > = {
                        uuid: dashboard_tile_uuid,
                        x: x_offset,
                        y: y_offset,
                        h: height,
                        w: width,
                        tabUuid: tab_uuid,
                    };

                    const commonProperties = {
                        title: title ?? '',
                        hideTitle: hide_title ?? false,
                    };

                    switch (type) {
                        case DashboardTileTypes.SAVED_CHART:
                            return <DashboardChartTile>{
                                ...base,
                                type: DashboardTileTypes.SAVED_CHART,
                                properties: {
                                    ...commonProperties,
                                    savedChartUuid: saved_query_uuid,
                                    belongsToDashboard: belongs_to_dashboard,
                                    chartName: name,
                                    lastVersionChartKind:
                                        last_version_chart_kind,
                                },
                            };
                        case DashboardTileTypes.MARKDOWN:
                            return <DashboardMarkdownTile>{
                                ...base,
                                type: DashboardTileTypes.MARKDOWN,
                                properties: {
                                    ...commonProperties,
                                    content: content || '',
                                },
                            };
                        case DashboardTileTypes.LOOM:
                            return <DashboardLoomTile>{
                                ...base,
                                type: DashboardTileTypes.LOOM,
                                properties: {
                                    ...commonProperties,
                                    url: url || '',
                                },
                            };
                        case DashboardTileTypes.SQL_CHART:
                            return <DashboardSqlChartTile>{
                                ...base,
                                type: DashboardTileTypes.SQL_CHART,
                                properties: {
                                    ...commonProperties,
                                    chartName: name,
                                    savedSqlUuid: saved_sql_uuid,
                                },
                            };
                        case DashboardTileTypes.SEMANTIC_VIEWER_CHART:
                            return <DashboardSemanticViewerChartTile>{
                                ...base,
                                type: DashboardTileTypes.SEMANTIC_VIEWER_CHART,
                                properties: {
                                    ...commonProperties,
                                    chartName: name,
                                    savedSemanticViewerChartUuid:
                                        saved_semantic_viewer_chart_uuid,
                                },
                            };
                        default: {
                            return assertUnreachable(
                                type,
                                new UnexpectedServerError(
                                    `Dashboard tile type "${type}" not recognised`,
                                ),
                            );
                        }
                    }
                },
            ),
            tabs,
            filters: view?.filters || {
                dimensions: [],
                metrics: [],
                tableCalculations: [],
            },
            spaceUuid: dashboard.space_uuid,
            spaceName: dashboard.space_name,
            views: dashboard.views_count,
            firstViewedAt: dashboard.first_viewed_at,
            updatedByUser: {
                userUuid: dashboard.user_uuid,
                firstName: dashboard.first_name,
                lastName: dashboard.last_name,
            },
            slug: dashboard.slug,
        };
    }

    /*
    This utility method wraps the slug generation functionality for testing purposes
    */
    static async generateUniqueSlug(trx: Knex, slug: string): Promise<string> {
        return generateUniqueSlug(trx, DashboardsTableName, slug);
    }

    async create(
        spaceUuid: string,
        dashboard: CreateDashboard & { slug: string },
        user: Pick<SessionUser, 'userUuid'>,
        projectUuid: string,
    ): Promise<DashboardDAO> {
        const dashboardId = await this.database.transaction(async (trx) => {
            const [space] = await trx(SpaceTableName)
                .where('space_uuid', spaceUuid)
                .select('spaces.*')
                .limit(1);
            if (!space) {
                throw new NotFoundError('Space not found');
            }

            const [newDashboard] = await trx(DashboardsTableName)
                .insert({
                    name: dashboard.name,
                    description: dashboard.description,
                    space_id: space.space_id,
                    slug: await DashboardModel.generateUniqueSlug(
                        trx,
                        dashboard.slug,
                    ),
                })
                .returning(['dashboard_id', 'dashboard_uuid']);

            await DashboardModel.createVersion(trx, newDashboard.dashboard_id, {
                ...dashboard,
                tabs: dashboard.tabs || [],
                updatedByUser: user,
            });

            return newDashboard.dashboard_uuid;
        });
        return this.getById(dashboardId);
    }

    async update(
        dashboardUuid: string,
        dashboard: DashboardUnversionedFields,
    ): Promise<DashboardDAO> {
        const withSpaceId = dashboard.spaceUuid
            ? {
                  space_id: (
                      await SpaceModel.getSpaceIdAndName(
                          this.database,
                          dashboard.spaceUuid,
                      )
                  )?.spaceId,
              }
            : {};
        await this.database(DashboardsTableName)
            .update({
                name: dashboard.name,
                description: dashboard.description,
                ...withSpaceId,
            })
            .where('dashboard_uuid', dashboardUuid);
        return this.getById(dashboardUuid);
    }

    async updateMultiple(
        projectUuid: string,
        dashboards: UpdateMultipleDashboards[],
    ): Promise<DashboardDAO[]> {
        await this.database.transaction(async (trx) => {
            await Promise.all(
                dashboards.map(async (dashboard) => {
                    const withSpaceId = dashboard.spaceUuid
                        ? {
                              space_id: (
                                  await SpaceModel.getSpaceIdAndName(
                                      this.database,
                                      dashboard.spaceUuid,
                                  )
                              )?.spaceId,
                          }
                        : {};
                    await trx(DashboardsTableName)
                        .update({
                            name: dashboard.name,
                            description: dashboard.description,
                            ...withSpaceId,
                        })
                        .where('dashboard_uuid', dashboard.uuid);
                }),
            );
        });

        return Promise.all(
            dashboards.map(async (dashboard) => this.getById(dashboard.uuid)),
        );
    }

    async delete(dashboardUuid: string): Promise<DashboardDAO> {
        const dashboard = await this.getById(dashboardUuid);
        await this.database(DashboardsTableName)
            .where('dashboard_uuid', dashboardUuid)
            .delete();
        return dashboard;
    }

    async addVersion(
        dashboardUuid: string,
        version: DashboardVersionedFields,
        user: Pick<SessionUser, 'userUuid'>,
        projectUuid: string,
    ): Promise<DashboardDAO> {
        const [dashboard] = await this.database(DashboardsTableName)
            .select(['dashboard_id'])
            .where('dashboard_uuid', dashboardUuid)
            .limit(1);
        if (!dashboard) {
            throw new NotFoundError('Dashboard not found');
        }
        await this.database.transaction(async (trx) => {
            await DashboardModel.createVersion(trx, dashboard.dashboard_id, {
                ...version,
                tabs: version.tabs || [],
                updatedByUser: user,
            });
        });
        return this.getById(dashboardUuid);
    }

    async getOrphanedCharts(
        dashboardUuid: string,
    ): Promise<Pick<SavedChart, 'uuid'>[]> {
        const getChartsInTilesQuery = this.database(DashboardTileChartTableName)
            .distinct('saved_chart_id')
            .leftJoin(
                DashboardVersionsTableName,
                `${DashboardVersionsTableName}.dashboard_version_id`,
                `${DashboardTileChartTableName}.dashboard_version_id`,
            )
            .leftJoin(
                DashboardsTableName,
                `${DashboardsTableName}.dashboard_id`,
                `${DashboardVersionsTableName}.dashboard_id`,
            )
            .where(`${DashboardsTableName}.dashboard_uuid`, dashboardUuid);

        const orphanedCharts = await this.database(SavedChartsTableName)
            .select(`saved_query_uuid`)
            .where(`${SavedChartsTableName}.dashboard_uuid`, dashboardUuid)
            .whereNotIn(`saved_query_id`, getChartsInTilesQuery);

        return orphanedCharts.map((chart) => ({
            uuid: chart.saved_query_uuid,
        }));
    }

    async findInfoForDbtExposures(projectUuid: string): Promise<
        Array<
            Pick<DashboardDAO, 'uuid' | 'name' | 'description'> &
                Pick<LightdashUser, 'firstName' | 'lastName'> & {
                    chartUuids: string[] | null;
                }
        >
    > {
        return this.database
            .table(DashboardsTableName)
            .leftJoin(
                DashboardVersionsTableName,
                `${DashboardsTableName}.dashboard_id`,
                `${DashboardVersionsTableName}.dashboard_id`,
            )
            .leftJoin(
                DashboardTileChartTableName,
                `${DashboardTileChartTableName}.dashboard_version_id`,
                `${DashboardVersionsTableName}.dashboard_version_id`,
            )
            .leftJoin(
                SavedChartsTableName,
                `${DashboardTileChartTableName}.saved_chart_id`,
                `${SavedChartsTableName}.saved_query_id`,
            )
            .leftJoin(
                SpaceTableName,
                `${DashboardsTableName}.space_id`,
                `${SpaceTableName}.space_id`,
            )
            .leftJoin(
                UserTableName,
                `${UserTableName}.user_uuid`,
                `${DashboardVersionsTableName}.updated_by_user_uuid`,
            )
            .innerJoin(
                ProjectTableName,
                `${SpaceTableName}.project_id`,
                `${ProjectTableName}.project_id`,
            )
            .select({
                uuid: `${DashboardsTableName}.dashboard_uuid`,
                name: `${DashboardsTableName}.name`,
                description: `${DashboardsTableName}.description`,
                firstName: `${UserTableName}.first_name`,
                lastName: `${UserTableName}.last_name`,
                chartUuids: this.database.raw(
                    'ARRAY_AGG(DISTINCT saved_queries.saved_query_uuid) FILTER (WHERE saved_queries.saved_query_uuid IS NOT NULL)',
                ),
            })
            .orderBy([
                {
                    column: `${DashboardVersionsTableName}.dashboard_id`,
                },
                {
                    column: `${DashboardVersionsTableName}.created_at`,
                    order: 'desc',
                },
            ])
            .groupBy(
                `${DashboardsTableName}.dashboard_uuid`,
                `${DashboardsTableName}.name`,
                `${DashboardsTableName}.description`,
                `${UserTableName}.first_name`,
                `${UserTableName}.last_name`,
                `${DashboardVersionsTableName}.dashboard_id`,
                `${DashboardVersionsTableName}.created_at`,
            )
            .distinctOn(`${DashboardVersionsTableName}.dashboard_id`)
            .where(`${ProjectTableName}.project_uuid`, projectUuid);
    }
}
