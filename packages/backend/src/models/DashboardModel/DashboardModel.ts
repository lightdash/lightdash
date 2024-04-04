import {
    assertUnreachable,
    Comment,
    CreateDashboard,
    DashboardBasicDetails,
    DashboardChartTile,
    DashboardDAO,
    DashboardLoomTile,
    DashboardMarkdownTile,
    DashboardTileTypes,
    DashboardUnversionedFields,
    DashboardVersionedFields,
    HTML_SANITIZE_MARKDOWN_TILE_RULES,
    LightdashUser,
    NotFoundError,
    sanitizeHtml,
    SavedChart,
    SessionUser,
    UnexpectedServerError,
    UpdateMultipleDashboards,
} from '@lightdash/common';
import { Knex } from 'knex';
import { AnalyticsDashboardViewsTableName } from '../../database/entities/analytics';
import {
    DashboardsTableName,
    DashboardTable,
    DashboardTileChartTable,
    DashboardTileChartTableName,
    DashboardTileLoomsTableName,
    DashboardTileMarkdownsTableName,
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
import { SpaceTableName } from '../../database/entities/spaces';
import {
    DbUser,
    UserTable,
    UserTableName,
} from '../../database/entities/users';
import { DbValidationTable } from '../../database/entities/validation';
import { SpaceModel } from '../SpaceModel';
import Transaction = Knex.Transaction;

export type GetDashboardQuery = Pick<
    DashboardTable['base'],
    'dashboard_id' | 'dashboard_uuid' | 'name' | 'description'
> &
    Pick<DashboardVersionTable['base'], 'dashboard_version_id' | 'created_at'> &
    Pick<ProjectTable['base'], 'project_uuid'> &
    Pick<UserTable['base'], 'user_uuid' | 'first_name' | 'last_name'> &
    Pick<OrganizationTable['base'], 'organization_uuid'> &
    Pick<PinnedListTable['base'], 'pinned_list_uuid'> &
    Pick<PinnedDashboardTable['base'], 'order'> & {
        views: string;
        first_viewed_at: Date | null;
    };

export type GetDashboardDetailsQuery = Pick<
    DashboardTable['base'],
    'dashboard_uuid' | 'name' | 'description'
> &
    Pick<DashboardVersionTable['base'], 'created_at'> &
    Pick<ProjectTable['base'], 'project_uuid'> &
    Pick<UserTable['base'], 'user_uuid' | 'first_name' | 'last_name'> &
    Pick<OrganizationTable['base'], 'organization_uuid'> &
    Pick<PinnedListTable['base'], 'pinned_list_uuid'> &
    Pick<PinnedDashboardTable['base'], 'order'> & {
        views: string;
    };

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

        const tilePromises = version.tiles.map(async (tile) => {
            const { uuid: dashboardTileId, type, w, h, x, y } = tile;

            const [insertedTile] = await trx(DashboardTilesTableName)
                .insert({
                    dashboard_version_id: versionId.dashboard_version_id,
                    dashboard_tile_uuid: dashboardTileId,
                    type,
                    height: h,
                    width: w,
                    x_offset: x,
                    y_offset: y,
                })
                .returning('*');

            switch (tile.type) {
                case DashboardTileTypes.SAVED_CHART: {
                    const chartUuid = tile.properties.savedChartUuid;
                    if (chartUuid) {
                        const [savedChart] = await trx(SavedChartsTableName)
                            .select(['saved_query_id'])
                            .where('saved_query_uuid', chartUuid)
                            .limit(1);
                        if (!savedChart) {
                            throw new NotFoundError('Saved chart not found');
                        }
                        await trx(DashboardTileChartTableName).insert({
                            dashboard_version_id:
                                versionId.dashboard_version_id,
                            dashboard_tile_uuid:
                                insertedTile.dashboard_tile_uuid,
                            saved_chart_id: savedChart.saved_query_id,
                            hide_title: tile.properties.hideTitle,
                            title: tile.properties.title,
                        });
                    }
                    break;
                }
                case DashboardTileTypes.MARKDOWN:
                    await trx(DashboardTileMarkdownsTableName).insert({
                        dashboard_version_id: versionId.dashboard_version_id,
                        dashboard_tile_uuid: insertedTile.dashboard_tile_uuid,
                        title: tile.properties.title,
                        content: sanitizeHtml(
                            tile.properties.content,
                            HTML_SANITIZE_MARKDOWN_TILE_RULES,
                        ),
                    });
                    break;
                case DashboardTileTypes.LOOM:
                    await trx(DashboardTileLoomsTableName).insert({
                        dashboard_version_id: versionId.dashboard_version_id,
                        dashboard_tile_uuid: insertedTile.dashboard_tile_uuid,
                        title: tile.properties.title,
                        url: tile.properties.url,
                        hide_title: tile.properties.hideTitle,
                    });
                    break;
                default: {
                    const never: never = tile;
                    throw new UnexpectedServerError(
                        `Dashboard tile type "${type}" not recognised`,
                    );
                }
            }

            return insertedTile;
        });

        const tiles = await Promise.all(tilePromises);
        const tileUuids = tiles.map((tile) => tile.dashboard_tile_uuid);

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

    async getAllByProject(
        projectUuid: string,
        chartUuid?: string,
    ): Promise<DashboardBasicDetails[]> {
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
                        this.database.raw(
                            `(SELECT COUNT('${AnalyticsDashboardViewsTableName}.dashboard_uuid') FROM ${AnalyticsDashboardViewsTableName} where ${AnalyticsDashboardViewsTableName}.dashboard_uuid = ${DashboardsTableName}.dashboard_uuid) as views`,
                        ),
                        this.database.raw(
                            `(SELECT ${AnalyticsDashboardViewsTableName}.timestamp FROM ${AnalyticsDashboardViewsTableName} where ${AnalyticsDashboardViewsTableName}.dashboard_uuid = ${DashboardsTableName}.dashboard_uuid ORDER BY ${AnalyticsDashboardViewsTableName}.timestamp ASC LIMIT 1) as first_viewed_at`,
                        ),
                        this.database.raw(`
                            COALESCE(
                                (
                                    SELECT json_agg(validations.*)
                                    FROM validations
                                    WHERE validations.dashboard_uuid = ${DashboardsTableName}.dashboard_uuid
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
                    `${DashboardTileChartTableName}.dashboard_tile_uuid`,
                    `${DashboardTilesTableName}.dashboard_tile_uuid`,
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

        return dashboards.map(
            ({
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
                views,
                first_viewed_at,
                validation_errors,
            }) => ({
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
                views: parseInt(views, 10) || 0,
                firstViewedAt: first_viewed_at,
                validationErrors: validation_errors?.map(
                    (error: DbValidationTable) => ({
                        validationId: error.validation_id,
                        error: error.error,
                        createdAt: error.created_at,
                    }),
                ),
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
                this.database.raw(
                    `(SELECT COUNT('${AnalyticsDashboardViewsTableName}.dashboard_uuid') FROM ${AnalyticsDashboardViewsTableName} where ${AnalyticsDashboardViewsTableName}.dashboard_uuid = ?) as views`,
                    dashboardUuid,
                ),
                this.database.raw(
                    `(SELECT ${AnalyticsDashboardViewsTableName}.timestamp FROM ${AnalyticsDashboardViewsTableName} where ${AnalyticsDashboardViewsTableName}.dashboard_uuid = ? ORDER BY ${AnalyticsDashboardViewsTableName}.timestamp ASC LIMIT 1) as first_viewed_at`,
                    dashboardUuid,
                ),
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
                    url: string | null;
                    content: string | null;
                    hide_title: boolean | null;
                    title: string | null;
                    views: string;
                    first_viewed_at: Date | null;
                    belongs_to_dashboard: boolean;
                    name: string | null;
                    last_version_chart_kind: string | null;
                }[]
            >(
                `${DashboardTilesTableName}.x_offset`,
                `${DashboardTilesTableName}.y_offset`,
                `${DashboardTilesTableName}.type`,
                `${DashboardTilesTableName}.width`,
                `${DashboardTilesTableName}.height`,
                `${DashboardTilesTableName}.dashboard_tile_uuid`,
                `${SavedChartsTableName}.saved_query_uuid`,
                `${SavedChartsTableName}.name`,
                `${SavedChartsTableName}.last_version_chart_kind`,
                this.database.raw(
                    `${SavedChartsTableName}.dashboard_uuid IS NOT NULL AS belongs_to_dashboard`,
                ),
                this.database.raw(
                    `COALESCE(
                        ${DashboardTileChartTableName}.title,
                        ${DashboardTileLoomsTableName}.title,
                        ${DashboardTileMarkdownsTableName}.title
                    ) AS title`,
                ),
                this.database.raw(
                    `COALESCE(
                        ${DashboardTileLoomsTableName}.hide_title,
                        ${DashboardTileChartTableName}.hide_title
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
                SavedChartsTableName,
                `${DashboardTileChartTableName}.saved_chart_id`,
                `${SavedChartsTableName}.saved_query_id`,
            )
            .where(
                `${DashboardTilesTableName}.dashboard_version_id`,
                dashboard.dashboard_version_id,
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
                    title,
                    hide_title,
                    url,
                    content,
                    belongs_to_dashboard,
                    name,
                    last_version_chart_kind,
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
            filters: view?.filters || {
                dimensions: [],
                metrics: [],
                tableCalculations: [],
            },
            spaceUuid: dashboard.space_uuid,
            spaceName: dashboard.space_name,
            views: parseInt(dashboard.views, 10) || 0,
            firstViewedAt: dashboard.first_viewed_at,
            updatedByUser: {
                userUuid: dashboard.user_uuid,
                firstName: dashboard.first_name,
                lastName: dashboard.last_name,
            },
        };
    }

    async create(
        spaceUuid: string,
        dashboard: CreateDashboard,
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
                })
                .returning(['dashboard_id', 'dashboard_uuid']);

            await DashboardModel.createVersion(trx, newDashboard.dashboard_id, {
                ...dashboard,
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
                  space_id: await SpaceModel.getSpaceId(
                      this.database,
                      dashboard.spaceUuid,
                  ),
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
                              space_id: await SpaceModel.getSpaceId(
                                  this.database,
                                  dashboard.spaceUuid,
                              ),
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
                updatedByUser: user,
            });
        });
        return this.getById(dashboardUuid);
    }

    async getOrphanedCharts(
        dashboardUuid: string,
    ): Promise<Pick<SavedChart, 'uuid'>[]> {
        const getLastVersionIdQuery = this.database(DashboardsTableName)
            .leftJoin(
                DashboardVersionsTableName,
                `${DashboardsTableName}.dashboard_id`,
                `${DashboardVersionsTableName}.dashboard_id`,
            )
            .select([`${DashboardVersionsTableName}.dashboard_version_id`])
            .where(`${DashboardsTableName}.dashboard_uuid`, dashboardUuid)
            .orderBy(`${DashboardVersionsTableName}.created_at`, 'desc')
            .limit(1);

        const getChartsInTilesQuery = this.database(DashboardTileChartTableName)
            .select(`saved_chart_id`)
            .where(
                `${DashboardTileChartTableName}.dashboard_version_id`,
                getLastVersionIdQuery,
            );
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
