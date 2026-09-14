import { ChartType, SEED_ORG_1_ADMIN, SEED_PROJECT } from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { DashboardsTableName } from '../../database/entities/dashboards';
import { ProjectTableName } from '../../database/entities/projects';
import { SavedChartsTableName } from '../../database/entities/savedCharts';
import { SpaceTableName } from '../../database/entities/spaces';
import {
    createSavedChart,
    SavedChartModel,
} from '../../models/SavedChartModel';
import { getTestContext } from '../../vitest.setup.integration';

type CreateSavedChartInput = Parameters<typeof createSavedChart>[3];

const directSql = '${orders.total_order_amount}';
const dashboardSql = '${orders.total_completed_order_amount}';

const buildChartInput = ({
    sql,
    owner,
}: {
    sql: string;
    owner:
        | { spaceUuid: string; dashboardUuid?: null }
        | { dashboardUuid: string; spaceUuid?: null };
}): CreateSavedChartInput => {
    const calculationName = `calculation_${randomUUID()}`;

    return {
        name: `Provenance chart ${randomUUID()}`,
        description: undefined,
        tableName: 'orders',
        metricQuery: {
            exploreName: 'orders',
            dimensions: [],
            metrics: [],
            filters: {},
            sorts: [],
            limit: 500,
            tableCalculations: [
                {
                    name: calculationName,
                    displayName: calculationName,
                    sql,
                },
            ],
            additionalMetrics: [],
            customDimensions: [],
        },
        chartConfig: { type: ChartType.TABLE, config: {} },
        tableConfig: { columnOrder: [calculationName] },
        pivotConfig: undefined,
        parameters: undefined,
        updatedByUser: {
            userUuid: SEED_ORG_1_ADMIN.user_uuid,
            firstName: SEED_ORG_1_ADMIN.first_name,
            lastName: SEED_ORG_1_ADMIN.last_name,
        },
        slug: `provenance-chart-${randomUUID()}`,
        ...owner,
    };
};

describe('SavedChartModel custom SQL provenance', () => {
    let database: Knex;
    let transaction: Knex.Transaction;
    let model: SavedChartModel;
    let organizationId: number;
    let spaceId: number;
    let spaceUuid: string;
    let dashboardUuid: string;
    let dashboardChartUuid: string;

    beforeAll(() => {
        database = getTestContext().db;
    });

    beforeEach(async () => {
        transaction = await database.transaction();
        model = new SavedChartModel({
            database: transaction,
            lightdashConfig: lightdashConfigMock,
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
                `${ProjectTableName}.organization_id`,
            )
            .first();
        if (!space) {
            throw new Error('Seed project space not found');
        }
        organizationId = space.organization_id;
        spaceId = space.space_id;
        spaceUuid = space.space_uuid;

        const [dashboard] = await transaction(DashboardsTableName)
            .insert({
                project_uuid: SEED_PROJECT.project_uuid,
                name: `Provenance dashboard ${randomUUID()}`,
                description: undefined,
                space_id: spaceId,
                slug: `provenance-dashboard-${randomUUID()}`,
            })
            .returning('dashboard_uuid');
        dashboardUuid = dashboard.dashboard_uuid;

        await createSavedChart(
            transaction,
            SEED_PROJECT.project_uuid,
            SEED_ORG_1_ADMIN.user_uuid,
            buildChartInput({
                sql: directSql,
                owner: { spaceUuid, dashboardUuid: null },
            }),
        );
        dashboardChartUuid = await createSavedChart(
            transaction,
            SEED_PROJECT.project_uuid,
            SEED_ORG_1_ADMIN.user_uuid,
            buildChartInput({
                sql: dashboardSql,
                owner: { dashboardUuid, spaceUuid: null },
            }),
        );
    });

    afterEach(async () => {
        if (!transaction.isCompleted()) {
            await transaction.rollback();
        }
    });

    const findTableCalculationProvenance = async (sqls: string[]) =>
        model.findCustomSqlProvenance({
            projectUuid: SEED_PROJECT.project_uuid,
            exploreName: 'orders',
            tableCalculationSqls: sqls,
            customSqlDimensions: [],
            additionalMetrics: [],
        });

    it('resolves direct and dashboard-owned charts through their viewable space', async () => {
        const provenance = await findTableCalculationProvenance([
            directSql,
            dashboardSql,
        ]);

        expect(provenance.tableCalculations).toEqual(
            expect.arrayContaining([
                { sql: directSql, spaceUuid },
                { sql: dashboardSql, spaceUuid },
            ]),
        );
        expect(provenance.tableCalculations).toHaveLength(2);
    });

    it('loads only the latest chart custom SQL provenance', async () => {
        const provenance = await model.getCustomSqlProvenanceForChart({
            projectUuid: SEED_PROJECT.project_uuid,
            savedChartUuid: dashboardChartUuid,
        });

        expect(provenance).toEqual({
            exploreName: 'orders',
            tableCalculations: [{ sql: dashboardSql }],
            customSqlDimensions: [],
            additionalMetrics: [],
        });
    });

    it('does not resolve modified SQL', async () => {
        const provenance = await findTableCalculationProvenance([
            `${dashboardSql} + 1`,
        ]);

        expect(provenance.tableCalculations).toEqual([]);
    });

    it.each(['dashboard', 'dashboard project', 'space', 'chart'] as const)(
        'does not resolve SQL from an invalid %s owner',
        async (invalidOwner) => {
            if (invalidOwner === 'dashboard') {
                await transaction(DashboardsTableName)
                    .where('dashboard_uuid', dashboardUuid)
                    .update({ deleted_at: new Date() });
            } else if (invalidOwner === 'dashboard project') {
                const [mismatchedProject] = await transaction(ProjectTableName)
                    .insert({
                        name: `Mismatched provenance project ${randomUUID()}`,
                        organization_id: organizationId,
                        project_type: SEED_PROJECT.project_type,
                        dbt_connection: SEED_PROJECT.dbt_connection,
                        dbt_connection_type: SEED_PROJECT.dbt_connection_type,
                        copied_from_project_uuid:
                            SEED_PROJECT.copied_from_project_uuid,
                        dbt_version: 'v1.4',
                        created_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
                        organization_warehouse_credentials_uuid:
                            SEED_PROJECT.organization_warehouse_credentials_uuid,
                    })
                    .returning('project_uuid');
                await transaction(DashboardsTableName)
                    .where('dashboard_uuid', dashboardUuid)
                    .update({ project_uuid: mismatchedProject.project_uuid });
            } else if (invalidOwner === 'space') {
                await transaction(SpaceTableName)
                    .where('space_id', spaceId)
                    .update({
                        deleted_at: new Date(),
                        deleted_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
                    });
            } else {
                await transaction(SavedChartsTableName)
                    .where('saved_query_uuid', dashboardChartUuid)
                    .update({ deleted_at: new Date() });
            }

            const provenance = await findTableCalculationProvenance([
                dashboardSql,
            ]);

            expect(provenance.tableCalculations).toEqual([]);
        },
    );

    it('deduplicates identical SQL persisted through the same legitimate space', async () => {
        await createSavedChart(
            transaction,
            SEED_PROJECT.project_uuid,
            SEED_ORG_1_ADMIN.user_uuid,
            buildChartInput({
                sql: dashboardSql,
                owner: { spaceUuid, dashboardUuid: null },
            }),
        );

        const provenance = await findTableCalculationProvenance([dashboardSql]);

        expect(provenance.tableCalculations).toEqual([
            { sql: dashboardSql, spaceUuid },
        ]);
    });
});
