import { DashboardTileTypes, SEED_PROJECT } from 'common';
import { Knex } from 'knex';
import { DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import { getSpaceWithQueries } from '../../entities/spaces';

export async function seed(knex: Knex): Promise<void> {
    // delete existing dashboards
    await knex('dashboards').del();

    const dashboardModel = new DashboardModel({
        database: knex,
    });

    const { queries, uuid: spaceUuid } = await getSpaceWithQueries(
        SEED_PROJECT.project_uuid,
    );

    await dashboardModel.create(spaceUuid, {
        name: 'Jaffle dashboard',
        tiles: queries.map(({ uuid: savedChartUuid }, i) => ({
            x: i % 2 === 0 ? 0 : 6,
            y: Math.floor(i / 2) * 3,
            w: i > 0 && i % 2 === 0 ? 12 : 6,
            h: 3,
            type: DashboardTileTypes.SAVED_CHART,
            properties: { savedChartUuid },
        })),
    });
}
