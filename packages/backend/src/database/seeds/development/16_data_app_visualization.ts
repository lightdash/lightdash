import {
    ChartType,
    DATA_APP_VIZ_TEMPLATE,
    generateSlug,
    SEED_DATA_APP_VIZ,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
    type DataAppVizSchema,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { lightdashConfig } from '../../../config/lightdashConfig';
import { AppModel } from '../../../models/AppModel';
import { SavedChartModel } from '../../../models/SavedChartModel';
import { SpaceModel } from '../../../models/SpaceModel';

const vizSchema: DataAppVizSchema = {
    fields: [
        {
            name: 'status',
            label: 'Status',
            type: 'dimension',
            required: true,
        },
    ],
    configOptions: [],
    colorPalette: null,
};

export async function seed(knex: Knex): Promise<void> {
    const [seedSpace] = await new SpaceModel({ database: knex }).find({
        projectUuid: SEED_PROJECT.project_uuid,
        slug: 'jaffle-shop',
    });
    if (!seedSpace) throw new Error('No space found for seeding');

    await new AppModel({ database: knex }).createWithVersion(
        {
            app_id: SEED_DATA_APP_VIZ.appUuid,
            project_uuid: SEED_PROJECT.project_uuid,
            created_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
            name: SEED_DATA_APP_VIZ.name,
            description: 'Minimal data app visualization for API tests',
            slug: generateSlug(SEED_DATA_APP_VIZ.name),
            space_uuid: seedSpace.uuid,
            template: DATA_APP_VIZ_TEMPLATE,
        },
        { version: SEED_DATA_APP_VIZ.version, prompt: '' },
        'ready',
        undefined,
        undefined,
        vizSchema,
        { forceSlug: true },
    );

    await new SavedChartModel({
        database: knex,
        lightdashConfig,
    }).create(SEED_PROJECT.project_uuid, SEED_ORG_1_ADMIN.user_uuid, {
        spaceUuid: seedSpace.uuid,
        slug: generateSlug(SEED_DATA_APP_VIZ.chartName),
        name: SEED_DATA_APP_VIZ.chartName,
        description: 'Saved chart backed by the seeded data app visualization',
        tableName: 'orders',
        metricQuery: {
            exploreName: 'orders',
            dimensions: ['orders_status'],
            metrics: ['orders_average_order_size'],
            filters: {},
            sorts: [],
            limit: 500,
            tableCalculations: [],
        },
        chartConfig: {
            type: ChartType.DATA_APP_VIZ,
            config: {
                dataAppVizUuid: SEED_DATA_APP_VIZ.appUuid,
                fieldMapping: { status: 'orders_status' },
            },
        },
        tableConfig: {
            columnOrder: ['orders_status', 'orders_average_order_size'],
        },
        updatedByUser: {
            userUuid: SEED_ORG_1_ADMIN.user_uuid,
            firstName: SEED_ORG_1_ADMIN.first_name,
            lastName: SEED_ORG_1_ADMIN.last_name,
        },
    });
}
