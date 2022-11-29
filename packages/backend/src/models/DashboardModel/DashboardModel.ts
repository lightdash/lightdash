import {
    assertUnreachable,
    CreateDashboard,
    Dashboard,
    DashboardBasicDetails,
    DashboardChartTile,
    DashboardLoomTile,
    DashboardMarkdownTile,
    DashboardTile,
    DashboardTileTypes,
    DashboardUnversionedFields,
    DashboardVersionedFields,
    NotFoundError,
    SessionUser,
    UnexpectedServerError,
    UpdateMultipleDashboards,
} from '@lightdash/common';
import { Knex } from 'knex';
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
    ProjectTable,
    ProjectTableName,
} from '../../database/entities/projects';
import {
    SavedChartsTableName,
    SavedChartTable,
} from '../../database/entities/savedCharts';
import { getSpaceId, SpaceTableName } from '../../database/entities/spaces';
import { UserTable, UserTableName } from '../../database/entities/users';
import Transaction = Knex.Transaction;

export type GetDashboardQuery = Pick<
    DashboardTable['base'],
    'dashboard_id' | 'dashboard_uuid' | 'name' | 'description'
> &
    Pick<DashboardVersionTable['base'], 'dashboard_version_id' | 'created_at'> &
    Pick<ProjectTable['base'], 'project_uuid'> &
    Pick<UserTable['base'], 'user_uuid' | 'first_name' | 'last_name'> &
    Pick<OrganizationTable['base'], 'organization_uuid'>;

export type GetDashboardDetailsQuery = Pick<
    DashboardTable['base'],
    'dashboard_uuid' | 'name' | 'description'
> &
    Pick<DashboardVersionTable['base'], 'created_at'> &
    Pick<ProjectTable['base'], 'project_uuid'> &
    Pick<UserTable['base'], 'user_uuid' | 'first_name' | 'last_name'> &
    Pick<OrganizationTable['base'], 'organization_uuid'>;
export type GetChartTileQuery = Pick<
    DashboardTileChartTable['base'],
    'dashboard_tile_uuid'
> &
    Pick<SavedChartTable['base'], 'saved_query_uuid'>;

type DashboardModelDependencies = {
    database: Knex;
};

export class DashboardModel {
    private readonly database: Knex;

    constructor(deps: DashboardModelDependencies) {
        this.database = deps.database;
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
            },
        });

        const promises: Promise<any>[] = [];
        version.tiles.forEach((tile) => {
            const { uuid: dashboardTileId, type, w, h, x, y } = tile;
            promises.push(
                (async () => {
                    const [insertedTile] = await trx(DashboardTilesTableName)
                        .insert({
                            dashboard_version_id:
                                versionId.dashboard_version_id,
                            dashboard_tile_uuid: dashboardTileId,
                            type,
                            height: h,
                            width: w,
                            x_offset: x,
                            y_offset: y,
                        })
                        .returning('*');
                    switch (tile.type) {
                        case DashboardTileTypes.SAVED_CHART:
                            if (tile.properties.savedChartUuid) {
                                const [savedChart] = await trx(
                                    SavedChartsTableName,
                                )
                                    .select(['saved_query_id'])
                                    .where(
                                        'saved_query_uuid',
                                        tile.properties.savedChartUuid,
                                    )
                                    .limit(1);
                                if (!savedChart) {
                                    throw new NotFoundError(
                                        'Saved chart not found',
                                    );
                                }
                                await trx(DashboardTileChartTableName).insert({
                                    dashboard_version_id:
                                        versionId.dashboard_version_id,
                                    dashboard_tile_uuid:
                                        insertedTile.dashboard_tile_uuid,
                                    saved_chart_id: savedChart.saved_query_id,
                                    hide_title: tile.properties.hideTitle,
                                });
                            }
                            break;
                        case DashboardTileTypes.MARKDOWN:
                            await trx(DashboardTileMarkdownsTableName).insert({
                                dashboard_version_id:
                                    versionId.dashboard_version_id,
                                dashboard_tile_uuid:
                                    insertedTile.dashboard_tile_uuid,
                                title: tile.properties.title,
                                content: tile.properties.content,
                            });
                            break;
                        case DashboardTileTypes.LOOM:
                            await trx(DashboardTileLoomsTableName).insert({
                                dashboard_version_id:
                                    versionId.dashboard_version_id,
                                dashboard_tile_uuid:
                                    insertedTile.dashboard_tile_uuid,
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
                })(),
            );
        });
        await Promise.all(promises);
    }

    async getAllByProject(
        projectUuid: string,
        chartUuid?: string,
    ): Promise<DashboardBasicDetails[]> {
        const cteTableName = 'cte';
        const dashboardsQuery = this.database
            .with(cteTableName, (queryBuilder) => {
                queryBuilder
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
                    .where('project_uuid', projectUuid);
            })
            .select(`${cteTableName}.*`);

        if (chartUuid) {
            dashboardsQuery
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
            }),
        );
    }

    async getById(dashboardUuid: string): Promise<Dashboard> {
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
            .select<
                (GetDashboardQuery & {
                    space_uuid: string;
                    spaceName: string;
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
                `${SpaceTableName}.name as spaceName`,
            ])
            .where('dashboard_uuid', dashboardUuid)
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
                }[]
            >(
                `${DashboardTilesTableName}.x_offset`,
                `${DashboardTilesTableName}.y_offset`,
                `${DashboardTilesTableName}.type`,
                `${DashboardTilesTableName}.width`,
                `${DashboardTilesTableName}.height`,
                `${DashboardTilesTableName}.dashboard_tile_uuid`,
                `${SavedChartsTableName}.saved_query_uuid`,
                this.database.raw(
                    `COALESCE(
                        ${SavedChartsTableName}.name,
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

        return {
            organizationUuid: dashboard.organization_uuid,
            projectUuid: dashboard.project_uuid,
            uuid: dashboard.dashboard_uuid,
            name: dashboard.name,
            description: dashboard.description,
            updatedAt: dashboard.created_at,
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
                }) => {
                    const base: Omit<
                        Dashboard['tiles'][number],
                        'type' | 'properties'
                    > = {
                        uuid: dashboard_tile_uuid,
                        x: x_offset,
                        y: y_offset,
                        h: height,
                        w: width,
                    };

                    const commonProperties: Pick<
                        DashboardTile['properties'],
                        'title' | 'hideTitle'
                    > = {
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
            },
            spaceUuid: dashboard.space_uuid,
            spaceName: dashboard.spaceName,
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
    ): Promise<Dashboard> {
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
    ): Promise<Dashboard> {
        const withSpaceId = dashboard.spaceUuid
            ? { space_id: await getSpaceId(this.database, dashboard.spaceUuid) }
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
    ): Promise<Dashboard[]> {
        await this.database.transaction(async (trx) => {
            try {
                await Promise.all(
                    dashboards.map(async (dashboard) => {
                        const withSpaceId = dashboard.spaceUuid
                            ? {
                                  space_id: await getSpaceId(
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
            } catch (e) {
                trx.rollback(e);
                throw e;
            }
        });

        return Promise.all(
            dashboards.map(async (dashboard) => this.getById(dashboard.uuid)),
        );
    }

    async delete(dashboardUuid: string): Promise<Dashboard> {
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
    ): Promise<Dashboard> {
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
}
