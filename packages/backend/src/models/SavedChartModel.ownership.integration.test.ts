import {
    ChartType,
    ConflictError,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { lightdashConfigMock } from '../config/lightdashConfig.mock';
import { DashboardsTableName } from '../database/entities/dashboards';
import { ProjectTableName } from '../database/entities/projects';
import {
    SavedChartsTableName,
    SavedChartVersionsTableName,
} from '../database/entities/savedCharts';
import { SpaceTableName } from '../database/entities/spaces';
import { getTestContext } from '../vitest.setup.integration';
import { createSavedChart, SavedChartModel } from './SavedChartModel';

type Owner = 'dashboard' | 'space';
type Destination = Owner | 'otherDashboard' | 'otherSpace';

describe('SavedChartModel ownership preconditions', () => {
    let database: Knex;
    let transaction: Knex.Transaction;
    let model: SavedChartModel;
    let space: { space_id: number; space_uuid: string };
    let otherSpace: { space_id: number; space_uuid: string };
    let dashboardUuid: string;
    let otherDashboardUuid: string;

    beforeAll(() => {
        database = getTestContext().db;
    });

    beforeEach(async () => {
        transaction = await database.transaction();
        model = new SavedChartModel({
            database: transaction,
            lightdashConfig: lightdashConfigMock,
        });
        const seedSpace = await transaction(SpaceTableName)
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .where(
                `${ProjectTableName}.project_uuid`,
                SEED_PROJECT.project_uuid,
            )
            .whereNull(`${SpaceTableName}.deleted_at`)
            .select(
                `${SpaceTableName}.space_id`,
                `${SpaceTableName}.space_uuid`,
                `${SpaceTableName}.project_id`,
                `${SpaceTableName}.created_by_user_id`,
            )
            .first();
        if (!seedSpace) {
            throw new Error('Seed project space not found');
        }
        space = seedSpace;
        const spaceSlug = `ownership-${randomUUID()}`;
        [otherSpace] = await transaction(SpaceTableName)
            .insert({
                name: 'Other ownership test space',
                project_id: seedSpace.project_id,
                created_by_user_id: seedSpace.created_by_user_id,
                slug: spaceSlug,
                path: spaceSlug.replaceAll('-', '_'),
                parent_space_uuid: null,
                inherit_parent_permissions: false,
                is_default_user_space: false,
            })
            .returning(['space_id', 'space_uuid']);
        const dashboards = await transaction(DashboardsTableName)
            .insert(
                ['Initial', 'Other'].map((name) => ({
                    project_uuid: SEED_PROJECT.project_uuid,
                    name: `${name} ownership test dashboard`,
                    description: undefined,
                    space_id: space.space_id,
                    slug: `ownership-${randomUUID()}`,
                })),
            )
            .returning('dashboard_uuid');
        dashboardUuid = dashboards[0].dashboard_uuid;
        otherDashboardUuid = dashboards[1].dashboard_uuid;
    });

    afterEach(async () => {
        await transaction.rollback();
    });

    const createChart = async (owner: Owner) => {
        const uuid = await createSavedChart(
            transaction,
            SEED_PROJECT.project_uuid,
            SEED_ORG_1_ADMIN.user_uuid,
            {
                name: 'Original chart name',
                description: 'Original description',
                tableName: 'orders',
                metricQuery: {
                    exploreName: 'orders',
                    dimensions: [],
                    metrics: [],
                    filters: {},
                    sorts: [],
                    limit: 100,
                    tableCalculations: [],
                },
                chartConfig: { type: ChartType.TABLE, config: {} },
                tableConfig: { columnOrder: [] },
                updatedByUser: {
                    userUuid: SEED_ORG_1_ADMIN.user_uuid,
                    firstName: SEED_ORG_1_ADMIN.first_name,
                    lastName: SEED_ORG_1_ADMIN.last_name,
                },
                slug: `ownership-chart-${randomUUID()}`,
                ...(owner === 'dashboard'
                    ? { dashboardUuid, spaceUuid: null }
                    : { spaceUuid: space.space_uuid, dashboardUuid: null }),
            },
        );
        return model.get(uuid);
    };

    const changeOwner = async (chartUuid: string, destination: Destination) => {
        const owners = {
            dashboard: { dashboard_uuid: dashboardUuid, space_id: null },
            otherDashboard: {
                dashboard_uuid: otherDashboardUuid,
                space_id: null,
            },
            space: { dashboard_uuid: null, space_id: space.space_id },
            otherSpace: { dashboard_uuid: null, space_id: otherSpace.space_id },
        };
        await transaction(SavedChartsTableName)
            .where('saved_query_uuid', chartUuid)
            .update(owners[destination]);
    };

    it.each<Owner>(['dashboard', 'space'])(
        'updates metadata and creates a version when the %s owner is unchanged',
        async (owner) => {
            const chart = await createChart(owner);
            const expectedLocation = {
                projectUuid: chart.projectUuid,
                dashboardUuid: chart.dashboardUuid,
                spaceUuid: chart.spaceUuid,
            };
            await model.update(
                chart.uuid,
                { name: 'Allowed update' },
                expectedLocation,
            );
            const updated = await model.createVersion(
                chart.uuid,
                { ...chart, metricQuery: { ...chart.metricQuery, limit: 101 } },
                undefined,
                transaction,
                expectedLocation,
            );
            expect(updated.name).toBe('Allowed update');
            expect(updated.metricQuery.limit).toBe(101);
            const versions = await transaction(
                SavedChartVersionsTableName,
            ).whereIn(
                'saved_query_id',
                transaction(SavedChartsTableName)
                    .select('saved_query_id')
                    .where('saved_query_uuid', chart.uuid),
            );
            expect(versions).toHaveLength(2);
        },
    );

    describe.each<{
        name: string;
        owner: Owner;
        destination: Destination;
    }>([
        {
            name: 'dashboard changes',
            owner: 'dashboard',
            destination: 'otherDashboard',
        },
        {
            name: 'dashboard becomes space-owned',
            owner: 'dashboard',
            destination: 'space',
        },
        {
            name: 'space becomes dashboard-owned',
            owner: 'space',
            destination: 'dashboard',
        },
        { name: 'space changes', owner: 'space', destination: 'otherSpace' },
    ])('$name', ({ owner, destination }) => {
        it.each(['metadata', 'version'] as const)(
            'rejects the stale %s write without changing the chart or versions',
            async (operation) => {
                const chart = await createChart(owner);
                const expectedLocation = {
                    projectUuid: chart.projectUuid,
                    dashboardUuid: chart.dashboardUuid,
                    spaceUuid: chart.spaceUuid,
                };
                await changeOwner(chart.uuid, destination);
                const before = await transaction(SavedChartsTableName)
                    .where('saved_query_uuid', chart.uuid)
                    .first();
                if (!before) {
                    throw new Error('Ownership fixture chart not found');
                }
                const versionsBefore = await transaction(
                    SavedChartVersionsTableName,
                ).where('saved_query_id', before.saved_query_id);
                const write =
                    operation === 'metadata'
                        ? model.update(
                              chart.uuid,
                              {
                                  name: 'Rejected update',
                                  description: 'Rejected description',
                              },
                              expectedLocation,
                          )
                        : model.createVersion(
                              chart.uuid,
                              {
                                  ...chart,
                                  metricQuery: {
                                      ...chart.metricQuery,
                                      limit: 999,
                                  },
                              },
                              undefined,
                              transaction,
                              expectedLocation,
                          );
                await expect(write).rejects.toThrowError(ConflictError);
                expect(
                    await transaction(SavedChartsTableName)
                        .where('saved_query_uuid', chart.uuid)
                        .first(),
                ).toEqual(before);
                expect(
                    await transaction(SavedChartVersionsTableName).where(
                        'saved_query_id',
                        before.saved_query_id,
                    ),
                ).toEqual(versionsBefore);
            },
        );
    });
});
