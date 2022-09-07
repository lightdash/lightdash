import {
    DashboardChartTile,
    DashboardLoomTile,
    DashboardMarkdownTile,
    DashboardTileTypes,
    FilterOperator,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
} from '@lightdash/common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import { getSpaceWithQueries } from '../../entities/spaces';

const markdownSample = `### Lightdash is an open source analytics for your dbt project. 

We're kind of like Looker, but without the price tag. 

#### At Lightdash, our mission is simple: 

> we want to enable everybody in your company to answer their own questions using data.

Have any questions? Feel free to send us a message at support@lightdash.com. Or, just talk to the bot on this page - he may not have the answers to life's great questions, but he'll get you in touch with the right people.
`;

const markdownRevenue = `Charts related to our Jaffle Shop's revenue.`;

const markdownOrders = `Details about our Jaffle orders and customer activity.`;

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
        w: 18,
        h: 9,
        type: DashboardTileTypes.LOOM,
        properties: {
            title: 'Tutorial: Creating your first metrics and dimensions',
            url: 'https://www.loom.com/share/6b8d3d5ccc644fa8bf68ffb754cbb783',
        },
    };

    const markdownTile: DashboardMarkdownTile = {
        uuid: uuidv4(),
        x: 18,
        y: 0,
        w: 18,
        h: 9,
        type: DashboardTileTypes.MARKDOWN,
        properties: {
            title: 'Welcome to Lightdash!',
            content: markdownSample,
        },
    };

    const markdownRevenueTile: DashboardMarkdownTile = {
        uuid: uuidv4(),
        x: 0,
        y: 9,
        w: 36,
        h: 3,
        type: DashboardTileTypes.MARKDOWN,
        properties: {
            title: '💸 Revenue',
            content: markdownRevenue,
        },
    };

    const barChart: DashboardChartTile = {
        uuid: uuidv4(),
        x: 0,
        y: 12,
        w: 24,
        h: 9,
        type: DashboardTileTypes.SAVED_CHART,
        properties: { savedChartUuid: queries[0].uuid },
    };

    const bigNumberTile: DashboardChartTile = {
        uuid: uuidv4(),
        x: 24,
        y: 12,
        w: 12,
        h: 9,
        type: DashboardTileTypes.SAVED_CHART,
        properties: { savedChartUuid: queries[1].uuid },
    };

    const lineChartTile: DashboardChartTile = {
        uuid: uuidv4(),
        x: 0,
        y: 24,
        w: 18,
        h: 9,
        type: DashboardTileTypes.SAVED_CHART,
        properties: { savedChartUuid: queries[2].uuid },
    };

    const barTile: DashboardChartTile = {
        uuid: uuidv4(),
        x: 18,
        y: 24,
        w: 18,
        h: 9,
        type: DashboardTileTypes.SAVED_CHART,
        properties: { savedChartUuid: queries[3].uuid },
    };

    const tableTile: DashboardChartTile = {
        uuid: uuidv4(),
        x: 0,
        y: 33,
        w: 36,
        h: 9,
        type: DashboardTileTypes.SAVED_CHART,
        properties: { savedChartUuid: queries[4].uuid },
    };

    const markdownOrdersTile: DashboardMarkdownTile = {
        uuid: uuidv4(),
        x: 0,
        y: 21,
        w: 36,
        h: 3,
        type: DashboardTileTypes.MARKDOWN,
        properties: {
            title: '📨 Orders',
            content: markdownOrders,
        },
    };

    await dashboardModel.create(
        spaceUuid,
        {
            name: 'Jaffle dashboard',
            tiles: [
                loomTile,
                markdownTile,
                markdownRevenueTile,
                barChart,
                bigNumberTile,
                markdownOrdersTile,
                lineChartTile,
                barTile,
                tableTile,
            ],
            filters: {
                dimensions: [
                    {
                        id: 'e7df7c5a-1070-439a-8300-125fe5f9b1af',
                        target: {
                            fieldId: 'orders_is_completed',
                            tableName: 'orders',
                        },
                        values: [true],
                        operator: FilterOperator.EQUALS,
                    },
                    {
                        id: '6d28a3a5-c01f-46d8-9f6b-74a9ab1efd99',
                        target: {
                            fieldId: 'orders_order_date_year',
                            tableName: 'orders',
                        },
                        values: [5],
                        operator: FilterOperator.IN_THE_PAST,
                        settings: { completed: true, unitOfTime: 'years' },
                    },
                ],
                metrics: [],
            },
        },
        {
            userUuid: SEED_ORG_1_ADMIN.user_uuid,
        },
    );
}
