import { faker } from '@faker-js/faker';
import {
    CartesianSeriesType,
    ChartType,
    DashboardTileTypes,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
} from '@lightdash/common';
import { Knex } from 'knex';
import { random, sample } from 'lodash';
import { v4 as uuidv4 } from 'uuid';
import {
    dashboardModel,
    savedChartModel,
    spaceModel,
} from '../../../models/models';

export async function seed(knex: Knex): Promise<void> {
    if (
        !process.env.FAKE_DATA_LENGTH ||
        parseInt(process.env.FAKE_DATA_LENGTH, 10) < 1
    )
        return;

    const userId = (await knex.select('user_id').from('users').where({
        user_uuid: SEED_ORG_1_ADMIN.user_uuid,
    }))![0].user_id;

    const FAKE_DATA_LENGTH = parseInt(process.env.FAKE_DATA_LENGTH, 10);

    const spacePromises = Array.from({ length: FAKE_DATA_LENGTH }, () =>
        spaceModel.createSpace(
            SEED_PROJECT.project_uuid,
            faker.company.name(),
            userId,
            sample([true, false]),
        ),
    );
    const spaces = await Promise.all(spacePromises);

    const savedChartPromises = Array.from({ length: FAKE_DATA_LENGTH }, () =>
        savedChartModel.create(
            SEED_PROJECT.project_uuid,
            SEED_ORG_1_ADMIN.user_uuid,
            {
                spaceUuid: sample(spaces)!.uuid,
                name: faker.commerce.productName(),
                description:
                    'A saved chart to show the total revenue and unique payment count by payment method.',
                tableName: 'payments',
                metricQuery: {
                    exploreName: 'payments',
                    dimensions: ['payments_payment_method'],
                    metrics: [
                        'payments_total_revenue',
                        'payments_unique_payment_count',
                    ],
                    filters: {},
                    sorts: [],
                    limit: 10,
                    tableCalculations: [],
                },
                chartConfig: {
                    type: ChartType.CARTESIAN,
                    config: {
                        layout: {
                            flipAxes: true,
                            xField: 'payments_payment_method',
                            yField: [
                                'payments_total_revenue',
                                'payments_unique_payment_count',
                            ],
                        },
                        eChartsConfig: {
                            series: [
                                {
                                    encode: {
                                        xRef: {
                                            field: 'payments_payment_method',
                                        },
                                        yRef: {
                                            field: 'payments_total_revenue',
                                        },
                                    },
                                    type: CartesianSeriesType.BAR,
                                    yAxisIndex: 0,
                                },
                                {
                                    encode: {
                                        xRef: {
                                            field: 'payments_payment_method',
                                        },
                                        yRef: {
                                            field: 'payments_unique_payment_count',
                                        },
                                    },
                                    type: CartesianSeriesType.BAR,
                                    yAxisIndex: 0,
                                },
                            ],
                        },
                    },
                },
                tableConfig: {
                    columnOrder: [
                        'payments_payment_method',
                        'payments_total_revenue',
                        'payments_unique_payment_count',
                    ],
                },
                updatedByUser: {
                    userUuid: SEED_ORG_1_ADMIN.user_uuid,
                    firstName: SEED_ORG_1_ADMIN.first_name,
                    lastName: SEED_ORG_1_ADMIN.last_name,
                },
            },
        ),
    );
    const savedCharts = await Promise.all(savedChartPromises);

    const dashboardPromises = Array.from({ length: FAKE_DATA_LENGTH }, () =>
        dashboardModel.create(
            sample(spaces)!.uuid,
            {
                name: faker.commerce.productName(),
                description: faker.hacker.phrase(),
                tiles: Array.from({ length: random(0, 10) }, () => ({
                    uuid: uuidv4(),
                    x: random(0, 100),
                    y: random(0, 100),
                    w: random(0, 100),
                    h: random(0, 100),
                    type: DashboardTileTypes.SAVED_CHART,
                    properties: {
                        savedChartUuid: sample(savedCharts)!.uuid,
                    },
                })),
                filters: {
                    dimensions: [],
                    metrics: [],
                    tableCalculations: [],
                },
            },
            {
                userUuid: SEED_ORG_1_ADMIN.user_uuid,
            },
            SEED_PROJECT.project_uuid,
        ),
    );
    await Promise.all(dashboardPromises);
}
