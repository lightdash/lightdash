import {
    CreateDashboardChartTile,
    CreateDashboardLoomTile,
    CreateDashboardMarkdownTile,
    DashboardTileTypes,
    FilterOperator,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
    SpaceQuery,
} from '@lightdash/common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import { SpaceModel } from '../../../models/SpaceModel';

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

    const spaceModel = new SpaceModel({
        database: knex,
    });

    const { queries, uuid: spaceUuid } = await spaceModel.getSpaceWithQueries(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
    );

    const getChartByName = (name: string): SpaceQuery => {
        const chart = queries.find(({ name: queryName }) => queryName === name);
        if (!chart) {
            throw new Error(`Could not find seeded chart with name ${name}`);
        }
        return chart;
    };

    const loomTile: CreateDashboardLoomTile = {
        uuid: uuidv4(),
        x: 0,
        y: 0,
        w: 18,
        h: 9,
        type: DashboardTileTypes.LOOM,
        tabUuid: undefined,
        properties: {
            title: 'Tutorial: Creating your first metrics and dimensions',
            url: 'https://www.loom.com/share/6b8d3d5ccc644fa8bf68ffb754cbb783',
        },
    };

    const markdownTile: CreateDashboardMarkdownTile = {
        uuid: uuidv4(),
        x: 18,
        y: 0,
        w: 18,
        h: 9,
        type: DashboardTileTypes.MARKDOWN,
        tabUuid: undefined,
        properties: {
            title: 'Welcome to Lightdash!',
            content: markdownSample,
        },
    };

    const markdownRevenueTile: CreateDashboardMarkdownTile = {
        uuid: uuidv4(),
        x: 0,
        y: 9,
        w: 36,
        h: 3,
        type: DashboardTileTypes.MARKDOWN,
        tabUuid: undefined,
        properties: {
            title: '💸 Revenue',
            content: markdownRevenue,
        },
    };

    const barChart: CreateDashboardChartTile = {
        uuid: uuidv4(),
        x: 0,
        y: 12,
        w: 24,
        h: 9,
        type: DashboardTileTypes.SAVED_CHART,
        tabUuid: undefined,
        properties: {
            savedChartUuid: getChartByName(
                'How much revenue do we have per payment method?',
            ).uuid,
        },
    };

    const bigNumberTile: CreateDashboardChartTile = {
        uuid: uuidv4(),
        x: 24,
        y: 12,
        w: 12,
        h: 9,
        type: DashboardTileTypes.SAVED_CHART,
        tabUuid: undefined,
        properties: {
            savedChartUuid: getChartByName("What's our total revenue to date?")
                .uuid,
        },
    };

    const lineChartTile: CreateDashboardChartTile = {
        uuid: uuidv4(),
        x: 0,
        y: 24,
        w: 18,
        h: 9,
        type: DashboardTileTypes.SAVED_CHART,
        tabUuid: undefined,
        properties: {
            savedChartUuid: getChartByName(
                'How many orders we have over time ?',
            ).uuid,
        },
    };

    const barTile: CreateDashboardChartTile = {
        uuid: uuidv4(),
        x: 18,
        y: 24,
        w: 18,
        h: 9,
        type: DashboardTileTypes.SAVED_CHART,
        tabUuid: undefined,
        properties: {
            savedChartUuid: getChartByName(
                "What's the average spend per customer?",
            ).uuid,
        },
    };

    const tableTile: CreateDashboardChartTile = {
        uuid: uuidv4(),
        x: 0,
        y: 33,
        w: 36,
        h: 9,
        type: DashboardTileTypes.SAVED_CHART,
        tabUuid: undefined,
        properties: {
            savedChartUuid: getChartByName(
                'Which customers have not recently ordered an item?',
            ).uuid,
        },
    };

    const markdownOrdersTile: CreateDashboardMarkdownTile = {
        uuid: uuidv4(),
        x: 0,
        y: 21,
        w: 36,
        h: 3,
        type: DashboardTileTypes.MARKDOWN,
        tabUuid: undefined,
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
                        label: undefined,
                    },
                    {
                        id: '6d28a3a5-c01f-46d8-9f6b-74a9ab1efd99',
                        target: {
                            fieldId: 'orders_order_date_year',
                            tableName: 'orders',
                        },
                        values: [10],
                        operator: FilterOperator.IN_THE_PAST,
                        settings: { completed: true, unitOfTime: 'years' },
                        label: undefined,
                    },
                ],
                metrics: [],
                tableCalculations: [],
            },
            tabs: [],
        },
        {
            userUuid: SEED_ORG_1_ADMIN.user_uuid,
        },
        SEED_PROJECT.project_uuid,
    );
}
