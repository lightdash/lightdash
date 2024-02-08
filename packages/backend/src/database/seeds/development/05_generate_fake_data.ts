import { faker } from '@faker-js/faker';
import { SEED_ORG_1_ADMIN, SEED_PROJECT } from '@lightdash/common';
import { Knex } from 'knex';
import { DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import { getSpaceWithQueries } from '../../entities/spaces';

export async function seed(knex: Knex): Promise<void> {
    if (process.env.FAKE_DATA !== 'true') return;

    const dashboardModel = new DashboardModel({
        database: knex,
    });

    const { uuid: spaceUuid } = await getSpaceWithQueries(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
    );

    const promises = Array.from({ length: 1000 }, () =>
        dashboardModel.create(
            spaceUuid,
            {
                name: faker.commerce.productName(),
                description: faker.hacker.phrase(),
                tiles: [],
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

    await Promise.all(promises);
}
