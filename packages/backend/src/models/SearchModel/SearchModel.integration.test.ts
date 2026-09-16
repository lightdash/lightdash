import {
    ChartType,
    DashboardTileTypes,
    SearchItemType,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
    type DashboardTabResult,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import {
    DashboardsTableName,
    DashboardTabsTableName,
    DashboardTileChartTableName,
    DashboardTilesTableName,
    DashboardVersionsTableName,
} from '../../database/entities/dashboards';
import {
    ProjectTableName,
    type DbProject,
} from '../../database/entities/projects';
import { SavedChartsTableName } from '../../database/entities/savedCharts';
import { SpaceTableName } from '../../database/entities/spaces';
import { UserTableName } from '../../database/entities/users';
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

describe('SearchModel.search dashboard tabs', () => {
    let database: Knex;
    let transaction: Knex.Transaction;
    let model: SearchModel;
    let seedProject: DbProject;
    let seedSpace: { space_id: number; space_uuid: string };
    let seedUserId: number;

    const createProject = async () => {
        const [project] = await transaction(ProjectTableName)
            .insert({
                name: `Search tab project ${randomUUID()}`,
                organization_id: seedProject.organization_id,
                project_type: seedProject.project_type,
                dbt_connection: seedProject.dbt_connection,
                dbt_connection_type: seedProject.dbt_connection_type,
                copied_from_project_uuid: seedProject.copied_from_project_uuid,
                dbt_version: seedProject.dbt_version,
                created_by_user_uuid: seedProject.created_by_user_uuid,
                organization_warehouse_credentials_uuid:
                    seedProject.organization_warehouse_credentials_uuid,
            })
            .returning(['project_id', 'project_uuid']);
        return project;
    };

    const createSpace = async (projectId: number, deleted = false) => {
        const slug = `search-tab-space-${randomUUID()}`;
        const [space] = await transaction(SpaceTableName)
            .insert({
                name: `Search tab space ${randomUUID()}`,
                project_id: projectId,
                created_by_user_id: seedUserId,
                slug,
                path: slug.replaceAll('-', '_'),
                parent_space_uuid: null,
                inherit_parent_permissions: false,
                is_default_user_space: false,
            })
            .returning(['space_id', 'space_uuid']);
        if (deleted) {
            await transaction(SpaceTableName)
                .where('space_id', space.space_id)
                .update({
                    deleted_at: new Date(),
                    deleted_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
                });
        }
        return space;
    };

    const createDashboard = async ({
        projectUuid,
        spaceId,
        name,
        deleted = false,
    }: {
        projectUuid: string;
        spaceId: number;
        name: string;
        deleted?: boolean;
    }) => {
        const slug = `search-tab-dashboard-${randomUUID()}`;
        const [dashboard] = await transaction(DashboardsTableName)
            .insert({
                project_uuid: projectUuid,
                name,
                description: undefined,
                space_id: spaceId,
                slug,
            })
            .returning(['dashboard_id', 'dashboard_uuid']);
        if (deleted) {
            await transaction(DashboardsTableName)
                .where('dashboard_id', dashboard.dashboard_id)
                .update({
                    deleted_at: new Date(),
                    deleted_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
                });
        }
        return { ...dashboard, name, slug };
    };

    const createDashboardVersion = async (
        dashboardId: number,
        tabs: Array<{ uuid: string; name: string }>,
    ) => {
        const [version] = await transaction(DashboardVersionsTableName)
            .insert({
                dashboard_id: dashboardId,
                updated_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
                config: undefined,
            })
            .returning('dashboard_version_id');
        if (tabs.length > 0) {
            await transaction(DashboardTabsTableName).insert(
                tabs.map((tab, index) => ({
                    ...tab,
                    dashboard_id: dashboardId,
                    dashboard_version_id: version.dashboard_version_id,
                    order: index,
                    hidden: false,
                })),
            );
        }
    };

    const searchDashboardTabs = async (query: string) => {
        const results = await model.search(SEED_PROJECT.project_uuid, query, {
            type: SearchItemType.DASHBOARD_TAB,
        });
        return results.dashboardTabs;
    };

    const searchDashboardTabsWithEarlyUuidCollapse = async (query: string) =>
        transaction
            .withMaterialized('matching_tabs', (queryBuilder) =>
                queryBuilder
                    .distinctOn(`${DashboardTabsTableName}.uuid`)
                    .select(
                        `${DashboardTabsTableName}.uuid`,
                        `${DashboardTabsTableName}.name`,
                        `${DashboardTabsTableName}.dashboard_id`,
                        `${DashboardTabsTableName}.dashboard_version_id`,
                    )
                    .from(DashboardTabsTableName)
                    .where(
                        `${DashboardTabsTableName}.name`,
                        'ilike',
                        transaction.raw('?', [`%${query}%`]),
                    )
                    .orderBy(`${DashboardTabsTableName}.uuid`)
                    .orderBy(`${DashboardTabsTableName}.dashboard_version_id`),
            )
            .from('matching_tabs')
            .innerJoin(
                DashboardsTableName,
                `${DashboardsTableName}.dashboard_id`,
                'matching_tabs.dashboard_id',
            )
            .leftJoin(
                SpaceTableName,
                `${DashboardsTableName}.space_id`,
                `${SpaceTableName}.space_id`,
            )
            .innerJoin(
                ProjectTableName,
                `${ProjectTableName}.project_id`,
                `${SpaceTableName}.project_id`,
            )
            .where(
                `${ProjectTableName}.project_uuid`,
                SEED_PROJECT.project_uuid,
            )
            .whereNull(`${DashboardsTableName}.deleted_at`)
            .whereNull(`${SpaceTableName}.deleted_at`)
            .select('matching_tabs.uuid');

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
        const project = await transaction(ProjectTableName)
            .where('project_uuid', SEED_PROJECT.project_uuid)
            .first();
        const space = await transaction(SpaceTableName)
            .where('project_id', project?.project_id)
            .whereNull('deleted_at')
            .first(['space_id', 'space_uuid']);
        const user = await transaction(UserTableName)
            .where('user_uuid', SEED_ORG_1_ADMIN.user_uuid)
            .first('user_id');
        if (!project || !space || !user) {
            throw new Error('Search tab seed fixture not found');
        }
        seedProject = project;
        seedSpace = space;
        seedUserId = user.user_id;
    });

    afterEach(async () => {
        if (!transaction.isCompleted()) {
            await transaction.rollback();
        }
    });

    it('retains eligible UUID collisions after project and deletion filters', async () => {
        const token = uniqueToken('eligiblecollision');
        const foreignProject = await createProject();
        const foreignSpace = await createSpace(foreignProject.project_id);
        const deletedSpace = await createSpace(seedProject.project_id, true);
        const collisionFixtures = [
            {
                uuid: randomUUID(),
                excluded: await createDashboard({
                    projectUuid: foreignProject.project_uuid,
                    spaceId: foreignSpace.space_id,
                    name: 'Foreign project dashboard',
                }),
            },
            {
                uuid: randomUUID(),
                excluded: await createDashboard({
                    projectUuid: SEED_PROJECT.project_uuid,
                    spaceId: seedSpace.space_id,
                    name: 'Deleted dashboard',
                    deleted: true,
                }),
            },
            {
                uuid: randomUUID(),
                excluded: await createDashboard({
                    projectUuid: SEED_PROJECT.project_uuid,
                    spaceId: deletedSpace.space_id,
                    name: 'Deleted space dashboard',
                }),
            },
        ];
        const expectedRows: DashboardTabResult[] = await Promise.all(
            collisionFixtures.map(async (fixture) => {
                await createDashboardVersion(fixture.excluded.dashboard_id, [
                    { uuid: fixture.uuid, name: `${token} excluded` },
                ]);
                const eligible = await createDashboard({
                    projectUuid: SEED_PROJECT.project_uuid,
                    spaceId: seedSpace.space_id,
                    name: `Eligible dashboard ${fixture.uuid}`,
                });
                await createDashboardVersion(eligible.dashboard_id, [
                    { uuid: fixture.uuid, name: `${token} eligible` },
                ]);
                return {
                    uuid: fixture.uuid,
                    name: `${token} eligible`,
                    dashboardUuid: eligible.dashboard_uuid,
                    dashboardSlug: eligible.slug,
                    dashboardName: eligible.name,
                    spaceUuid: seedSpace.space_uuid,
                };
            }),
        );

        await expect(
            searchDashboardTabsWithEarlyUuidCollapse(token),
        ).resolves.toEqual([]);
        const results = await searchDashboardTabs(token);
        expect(results).toHaveLength(expectedRows.length);
        expect(results).toEqual(expect.arrayContaining(expectedRows));
    });

    it('keeps renamed and removed historical tabs searchable', async () => {
        const token = uniqueToken('historicaltab');
        const dashboard = await createDashboard({
            projectUuid: SEED_PROJECT.project_uuid,
            spaceId: seedSpace.space_id,
            name: 'Historical tab dashboard',
        });
        const renamedUuid = randomUUID();
        const removedUuid = randomUUID();
        await createDashboardVersion(dashboard.dashboard_id, [
            { uuid: renamedUuid, name: `${token} renamed` },
            { uuid: removedUuid, name: `${token} removed` },
        ]);
        await createDashboardVersion(dashboard.dashboard_id, [
            { uuid: renamedUuid, name: `${token} renamed` },
        ]);
        await createDashboardVersion(dashboard.dashboard_id, [
            { uuid: renamedUuid, name: 'Current nonmatching name' },
        ]);

        const results = await searchDashboardTabs(token);
        expect(results).toHaveLength(2);
        expect(results).toEqual(
            expect.arrayContaining([
                {
                    uuid: renamedUuid,
                    name: `${token} renamed`,
                    dashboardUuid: dashboard.dashboard_uuid,
                    dashboardSlug: dashboard.slug,
                    dashboardName: dashboard.name,
                    spaceUuid: seedSpace.space_uuid,
                },
                {
                    uuid: removedUuid,
                    name: `${token} removed`,
                    dashboardUuid: dashboard.dashboard_uuid,
                    dashboardSlug: dashboard.slug,
                    dashboardName: dashboard.name,
                    spaceUuid: seedSpace.space_uuid,
                },
            ]),
        );
    });

    it('returns one coherent permission target for an ambiguous UUID', async () => {
        const token = uniqueToken('permissiontarget');
        const otherSpace = await createSpace(seedProject.project_id);
        const firstDashboard = await createDashboard({
            projectUuid: SEED_PROJECT.project_uuid,
            spaceId: seedSpace.space_id,
            name: 'First permission dashboard',
        });
        const secondDashboard = await createDashboard({
            projectUuid: SEED_PROJECT.project_uuid,
            spaceId: otherSpace.space_id,
            name: 'Second permission dashboard',
        });
        const sharedUuid = randomUUID();
        await createDashboardVersion(firstDashboard.dashboard_id, [
            { uuid: sharedUuid, name: `${token} first` },
        ]);
        await createDashboardVersion(secondDashboard.dashboard_id, [
            { uuid: sharedUuid, name: `${token} second` },
        ]);

        const results = await searchDashboardTabs(token);
        expect(results).toHaveLength(1);
        const permissionInput = {
            target: {
                type: 'dashboard',
                dashboardUuid: results[0].dashboardUuid,
                spaceUuid: results[0].spaceUuid,
            },
            metadata: {
                dashboardUuid: results[0].dashboardUuid,
                dashboardName: results[0].dashboardName,
            },
        };
        expect([
            {
                target: {
                    type: 'dashboard',
                    dashboardUuid: firstDashboard.dashboard_uuid,
                    spaceUuid: seedSpace.space_uuid,
                },
                metadata: {
                    dashboardUuid: firstDashboard.dashboard_uuid,
                    dashboardName: firstDashboard.name,
                },
            },
            {
                target: {
                    type: 'dashboard',
                    dashboardUuid: secondDashboard.dashboard_uuid,
                    spaceUuid: otherSpace.space_uuid,
                },
                metadata: {
                    dashboardUuid: secondDashboard.dashboard_uuid,
                    dashboardName: secondDashboard.name,
                },
            },
        ]).toContainEqual(permissionInput);
    });

    it('uses the space project path for eligibility', async () => {
        const token = uniqueToken('spaceprojectpath');
        const foreignProject = await createProject();
        const dashboard = await createDashboard({
            projectUuid: foreignProject.project_uuid,
            spaceId: seedSpace.space_id,
            name: 'Project path dashboard',
        });
        const tabUuid = randomUUID();
        await createDashboardVersion(dashboard.dashboard_id, [
            { uuid: tabUuid, name: token },
        ]);

        await expect(searchDashboardTabs(token)).resolves.toEqual([
            {
                uuid: tabUuid,
                name: token,
                dashboardUuid: dashboard.dashboard_uuid,
                dashboardSlug: dashboard.slug,
                dashboardName: dashboard.name,
                spaceUuid: seedSpace.space_uuid,
            },
        ]);
    });
});
