import { Knex } from 'knex';
import {
    DashboardVersionedFields,
    CreateDashboard,
    Dashboard,
    DashboardBasicDetails,
    DashboardTileTypes,
    DashboardUnversionedFields,
} from 'common';
import { NotFoundError } from '../errors';
import {
    DashboardsTableName,
    DashboardVersionsTableName,
    DashboardTilesTableName,
    DashboardTable,
    DashboardVersionTable,
    DashboardTileChartTableName,
    DashboardTileChartTable,
} from '../database/entities/dashboards';
import {
    SavedQueriesTableName,
    SavedQueryTable,
} from '../database/entities/savedQueries';
import { ProjectTableName } from '../database/entities/projects';
import { SpaceTableName } from '../database/entities/spaces';
import Transaction = Knex.Transaction;

export type GetDashboardQuery = Pick<
    DashboardTable['base'],
    'dashboard_id' | 'dashboard_uuid' | 'name' | 'description'
> &
    Pick<DashboardVersionTable['base'], 'dashboard_version_id' | 'created_at'>;
export type GetDashboardDetailsQuery = Pick<
    DashboardTable['base'],
    'dashboard_uuid' | 'name' | 'description'
> &
    Pick<DashboardVersionTable['base'], 'created_at'>;
export type GetChartTileQuery = Pick<DashboardTileChartTable['base'], 'rank'> &
    Pick<SavedQueryTable['base'], 'saved_query_uuid'>;

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
            },
            ['dashboard_version_id'],
        );

        const promises: Promise<any>[] = [];
        version.tiles.forEach(({ type, w, h, x, y, properties }, index) => {
            promises.push(
                (async () => {
                    await trx(DashboardTilesTableName).insert({
                        dashboard_version_id: versionId.dashboard_version_id,
                        rank: index,
                        type,
                        height: h,
                        width: w,
                        x_offset: x,
                        y_offset: y,
                    });
                    if (type === DashboardTileTypes.SAVED_CHART) {
                        const [savedChart] = await trx(SavedQueriesTableName)
                            .select(['saved_query_id'])
                            .where(
                                'saved_query_uuid',
                                properties.savedChartUuid,
                            )
                            .limit(1);
                        if (!savedChart) {
                            throw new NotFoundError('Saved chart not found');
                        }
                        await trx(DashboardTileChartTableName).insert({
                            dashboard_version_id:
                                versionId.dashboard_version_id,
                            rank: index,
                            saved_chart_id: savedChart.saved_query_id,
                        });
                    }
                })(),
            );
        });
        await Promise.all(promises);
    }

    async getAllByProject(
        projectUuid: string,
    ): Promise<DashboardBasicDetails[]> {
        const dashboards = await this.database(DashboardsTableName)
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
            .innerJoin(
                ProjectTableName,
                `${SpaceTableName}.project_id`,
                `${ProjectTableName}.project_id`,
            )
            .select<GetDashboardDetailsQuery[]>([
                `${DashboardsTableName}.dashboard_uuid`,
                `${DashboardsTableName}.name`,
                `${DashboardsTableName}.description`,
                `${DashboardVersionsTableName}.created_at`,
            ])
            .orderBy(`${DashboardVersionsTableName}.created_at`, 'desc')
            .distinctOn('dashboard_id')
            .where('project_uuid', projectUuid);
        return dashboards.map(
            ({ name, description, dashboard_uuid, created_at }) => ({
                name,
                description,
                uuid: dashboard_uuid,
                updatedAt: created_at,
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
            .select<GetDashboardQuery[]>([
                `${DashboardsTableName}.dashboard_id`,
                `${DashboardsTableName}.dashboard_uuid`,
                `${DashboardsTableName}.name`,
                `${DashboardsTableName}.description`,
                `${DashboardVersionsTableName}.dashboard_version_id`,
                `${DashboardVersionsTableName}.created_at`,
            ])
            .where('dashboard_uuid', dashboardUuid)
            .orderBy(`${DashboardVersionsTableName}.created_at`, 'desc')
            .limit(1);
        if (!dashboard) {
            throw new NotFoundError('Dashboard not found');
        }

        const tiles = await this.database(DashboardTilesTableName)
            .select('*')
            .where('dashboard_version_id', dashboard.dashboard_version_id)
            .orderBy('rank', 'asc');

        const charts = await this.database(DashboardTileChartTableName)
            .leftJoin(
                SavedQueriesTableName,
                `${DashboardTileChartTableName}.saved_chart_id`,
                `${SavedQueriesTableName}.saved_chart_id`,
            )
            .select<GetChartTileQuery[]>([
                `${DashboardTileChartTableName}.rank`,
                `${SavedQueriesTableName}.saved_query_uuid`,
            ])
            .where('dashboard_version_id', dashboard.dashboard_version_id)
            .orderBy('rank', 'asc');

        return {
            uuid: dashboard.dashboard_uuid,
            name: dashboard.name,
            description: dashboard.description,
            updatedAt: dashboard.created_at,
            tiles: tiles.map(
                ({ type, height, width, x_offset, y_offset, rank }) => ({
                    type,
                    properties: {
                        savedChartUuid:
                            charts.find((chart) => chart.rank === rank)
                                ?.saved_query_uuid || null,
                    },
                    x: x_offset,
                    y: y_offset,
                    h: height,
                    w: width,
                }),
            ),
        };
    }

    async create(
        spaceUuid: string,
        dashboard: CreateDashboard,
    ): Promise<string> {
        return this.database.transaction(async (trx) => {
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

            await DashboardModel.createVersion(
                trx,
                newDashboard.dashboard_id,
                dashboard,
            );

            return newDashboard.dashboard_uuid;
        });
    }

    async update(
        dashboardUuid: string,
        dashboard: DashboardUnversionedFields,
    ): Promise<void> {
        await this.database(DashboardsTableName)
            .update(dashboard)
            .where('dashboard_uuid', dashboardUuid);
    }

    async delete(dashboardUuid: string): Promise<void> {
        await this.database(DashboardsTableName)
            .where('dashboard_uuid', dashboardUuid)
            .delete();
    }

    async addVersion(
        dashboardUuid: string,
        version: DashboardVersionedFields,
    ): Promise<void> {
        const [dashboard] = await this.database(DashboardsTableName)
            .select(['dashboard_id'])
            .where('dashboard_uuid', dashboardUuid)
            .limit(1);
        if (!dashboard) {
            throw new NotFoundError('Dashboard not found');
        }
        return this.database.transaction(async (trx) => {
            await DashboardModel.createVersion(
                trx,
                dashboard.dashboard_id,
                version,
            );
        });
    }
}
