import {
    DashboardChartTile,
    DashboardLoomTile,
    DashboardMarkdownTile,
    DashboardTileTypes,
    SEED_PROJECT,
} from 'common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import { getSpaceWithQueries } from '../../entities/spaces';

const markdownSample = `### Lightdash is an open source analytics for your dbt project. 

We're kind of like Looker, but without the price tag. 

At Lightdash, our mission is simple: we want to enable everybody in your company to answer their own questions using data.

Have any questions? Feel free to send us a message at support@lightdash.com. Or, just talk to the bot on this page - he may not have the answers to life's great questions, but he'll get you in touch with the right people.
`;

export async function seed(knex: Knex): Promise<void> {
    // delete existing dashboards
    await knex('dashboards').del();

    const dashboardModel = new DashboardModel({
        database: knex,
    });

    const { queries, uuid: spaceUuid } = await getSpaceWithQueries(
        SEED_PROJECT.project_uuid,
    );

    const loomTile: DashboardLoomTile = {
        uuid: uuidv4(),
        x: 0,
        y: 0,
        w: 6,
        h: 3,
        type: DashboardTileTypes.LOOM,
        properties: {
            title: 'Tutorial: Creating your first metrics and dimensions',
            url: 'https://www.loom.com/share/6b8d3d5ccc644fa8bf68ffb754cbb783',
        },
    };

    const markdownTile: DashboardMarkdownTile = {
        uuid: uuidv4(),
        x: 6,
        y: 0,
        w: 6,
        h: 3,
        type: DashboardTileTypes.MARKDOWN,
        properties: {
            title: 'Welcome to Lightdash!',
            content: markdownSample,
        },
    };

    const chartTiles = queries.map<DashboardChartTile>(
        ({ uuid: savedChartUuid }, i) => ({
            uuid: uuidv4(),
            x: i % 2 === 0 ? 0 : 6,
            y: Math.floor(i / 2) * 3 + 3,
            w: i === 0 || i % 3 === 0 ? 12 : 6,
            h: 3,
            type: DashboardTileTypes.SAVED_CHART,
            properties: { savedChartUuid },
        }),
    );

    await dashboardModel.create(spaceUuid, {
        name: 'Jaffle dashboard',
        tiles: [loomTile, markdownTile, ...chartTiles],
        filters: {
            dimensions: [],
            metrics: [],
        },
    });
}
