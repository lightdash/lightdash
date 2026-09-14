import {
    ChartType,
    DashboardTileTypes,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import {
    DashboardsTableName,
    DashboardTileChartTableName,
    DashboardTilesTableName,
    DashboardVersionsTableName,
} from '../../database/entities/dashboards';
import { ProjectTableName } from '../../database/entities/projects';
import { SavedChartsTableName } from '../../database/entities/savedCharts';
import { SpaceTableName } from '../../database/entities/spaces';
import { getTestContext } from '../../vitest.setup.integration';
import { ContentVerificationModel } from '../ContentVerificationModel';
import { createSavedChart } from '../SavedChartModel';
import { SearchModel } from './index';

const uniqueToken = (prefix: string) =>
    `${prefix}${randomUUID().replace(/-/g, '').slice(0, 10)}`;

describe('SearchModel.searchDashboards', () => {
    let database: Knex;
    let transaction: Knex.Transaction;
    let model: SearchModel;
    let spaceUuid: string;
    let dashboardUuid: string;
    let dashboardId: number;
    let dashboardNameToken: string;
    let supersededChartToken: string;
    let currentChartToken: string;

    const createChartInSpace = async (name: string) => {
        const chartUuid = await createSavedChart(
            transaction,
            SEED_PROJECT.project_uuid,
            SEED_ORG_1_ADMIN.user_uuid,
            {
                name,
                description: undefined,
                tableName: 'orders',
                metricQuery: {
                    exploreName: 'orders',
                    dimensions: [],
                    metrics: [],
                    filters: {},
                    sorts: [],
                    limit: 500,
                    tableCalculations: [],
                    additionalMetrics: [],
                    customDimensions: [],
                },
                chartConfig: { type: ChartType.TABLE, config: {} },
                tableConfig: { columnOrder: [] },
                pivotConfig: undefined,
                parameters: undefined,
                updatedByUser: {
                    userUuid: SEED_ORG_1_ADMIN.user_uuid,
                    firstName: SEED_ORG_1_ADMIN.first_name,
                    lastName: SEED_ORG_1_ADMIN.last_name,
                },
                slug: `search-chart-${randomUUID()}`,
                spaceUuid,
                dashboardUuid: null,
            },
        );
        const chart = await transaction(SavedChartsTableName)
            .select('saved_query_id')
            .where('saved_query_uuid', chartUuid)
            .first();
        if (!chart) {
            throw new Error('Created chart not found');
        }
        return chart.saved_query_id;
    };

    const addVersionWithChartTile = async (savedChartId: number) => {
        const [version] = await transaction(DashboardVersionsTableName)
            .insert({
                dashboard_id: dashboardId,
                updated_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
                config: undefined,
            })
            .returning('dashboard_version_id');
        const tileUuid = randomUUID();
        await transaction(DashboardTilesTableName).insert({
            dashboard_version_id: version.dashboard_version_id,
            dashboard_tile_uuid: tileUuid,
            type: DashboardTileTypes.SAVED_CHART,
            x_offset: 0,
            y_offset: 0,
            height: 3,
            width: 5,
            tab_uuid: null,
        });
        await transaction(DashboardTileChartTableName).insert({
            dashboard_version_id: version.dashboard_version_id,
            dashboard_tile_uuid: tileUuid,
            saved_chart_id: savedChartId,
        });
    };

    beforeAll(() => {
        database = getTestContext().db;
    });

    beforeEach(async () => {
        transaction = await database.transaction();
        model = new SearchModel({
            database: transaction,
            contentVerificationModel: new ContentVerificationModel({
                database: transaction,
            }),
        });

        const space = await transaction(SpaceTableName)
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .where(
                `${ProjectTableName}.project_uuid`,
                SEED_PROJECT.project_uuid,
            )
            .select(
                `${SpaceTableName}.space_id`,
                `${SpaceTableName}.space_uuid`,
            )
            .first();
        if (!space) {
            throw new Error('Seed project space not found');
        }
        spaceUuid = space.space_uuid;

        dashboardNameToken = uniqueToken('board');
        const [dashboard] = await transaction(DashboardsTableName)
            .insert({
                project_uuid: SEED_PROJECT.project_uuid,
                name: `Search fixture ${dashboardNameToken}`,
                description: undefined,
                space_id: space.space_id,
                slug: `search-fixture-${randomUUID()}`,
            })
            .returning(['dashboard_uuid', 'dashboard_id']);
        dashboardUuid = dashboard.dashboard_uuid;
        dashboardId = dashboard.dashboard_id;

        supersededChartToken = uniqueToken('old');
        currentChartToken = uniqueToken('new');
        const supersededChartId = await createChartInSpace(
            `Superseded chart ${supersededChartToken}`,
        );
        const currentChartId = await createChartInSpace(
            `Current chart ${currentChartToken}`,
        );

        // Version 1 holds the superseded chart; version 2 replaces it with the
        // current chart, so the superseded chart only exists in history.
        await addVersionWithChartTile(supersededChartId);
        await addVersionWithChartTile(currentChartId);
    });

    afterEach(async () => {
        if (!transaction.isCompleted()) {
            await transaction.rollback();
        }
    });

    const searchDashboardUuids = async (query: string) => {
        const results = await model.searchDashboards(
            SEED_PROJECT.project_uuid,
            query,
        );
        return results.map((result) => result.uuid);
    };

    it('finds a dashboard through a chart on its current version', async () => {
        await expect(
            searchDashboardUuids(currentChartToken),
        ).resolves.toContain(dashboardUuid);
    });

    it('ignores charts that only appear on superseded versions', async () => {
        await expect(
            searchDashboardUuids(supersededChartToken),
        ).resolves.not.toContain(dashboardUuid);
    });

    it('still finds a dashboard by its own name', async () => {
        await expect(
            searchDashboardUuids(dashboardNameToken),
        ).resolves.toContain(dashboardUuid);
    });
});
