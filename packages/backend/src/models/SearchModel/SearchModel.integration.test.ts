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
import type { DbDocument } from '../../database/entities/documents';
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

describe('SearchModel.searchDocuments', () => {
    let projectUuid: string;
    const creatorUuid = SEED_ORG_1_ADMIN.user_uuid;
    let database: Knex.Transaction;
    let model: SearchModel;
    let spaceId: number;
    let spaceUuid: string;
    let projectId: number;
    let creatorId: number;
    const foreignProjectUuid = SEED_PROJECT.project_uuid;

    const createSpace = async () => {
        const slug = `document-search-${randomUUID()}`;
        const [space] = await database(SpaceTableName)
            .insert({
                name: 'Document search space',
                project_id: projectId,
                created_by_user_id: creatorId,
                slug,
                path: slug.replaceAll('-', '_'),
                parent_space_uuid: null,
                inherit_parent_permissions: false,
                is_default_user_space: false,
            })
            .returning(['space_id', 'space_uuid']);
        return space;
    };

    const insertDocument = async (overrides: Partial<DbDocument> = {}) => {
        const documentUuid = randomUUID();
        await database.raw(
            'INSERT INTO documents (document_uuid, project_uuid, space_id, slug, name, description, created_by_user_uuid, created_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                documentUuid,
                overrides.project_uuid ?? projectUuid,
                overrides.space_id ?? spaceId,
                overrides.slug ?? `report-${documentUuid}`,
                overrides.name ?? 'Revenue report',
                overrides.description ?? 'Quarterly forecast',
                overrides.created_by_user_uuid === undefined
                    ? creatorUuid
                    : overrides.created_by_user_uuid,
                overrides.created_at ?? new Date('2025-01-15T12:00:00Z'),
                overrides.deleted_at ?? null,
            ],
        );
        return documentUuid;
    };

    beforeEach(async () => {
        database = await getTestContext().db.transaction();
        model = new SearchModel({
            database,
            contentVerificationModel: new ContentVerificationModel({
                database,
            }),
        });
        const project = await database(ProjectTableName)
            .where('project_uuid', SEED_PROJECT.project_uuid)
            .first();
        const user = await database(UserTableName)
            .where('user_uuid', creatorUuid)
            .first('user_id');
        if (!project || !user) {
            throw new Error('Document search seed fixture not found');
        }
        creatorId = user.user_id;
        const [searchProject] = await database(ProjectTableName)
            .insert({
                name: `Document search project ${randomUUID()}`,
                organization_id: project.organization_id,
                project_type: project.project_type,
                dbt_connection: project.dbt_connection,
                dbt_connection_type: project.dbt_connection_type,
                copied_from_project_uuid: project.copied_from_project_uuid,
                dbt_version: project.dbt_version,
                created_by_user_uuid: project.created_by_user_uuid,
                organization_warehouse_credentials_uuid:
                    project.organization_warehouse_credentials_uuid,
            })
            .returning(['project_id', 'project_uuid']);
        projectUuid = searchProject.project_uuid;
        projectId = searchProject.project_id;
        const space = await createSpace();
        spaceId = space.space_id;
        spaceUuid = space.space_uuid;
    });

    afterEach(async () => {
        if (database && !database.isCompleted()) {
            await database.rollback();
        }
    });

    it('indexes insert and metadata updates without indexing or returning cell contents', async () => {
        const uuid = await insertDocument();
        const document = await database('documents')
            .where('document_uuid', uuid)
            .first('document_id');
        if (!document) {
            throw new Error('Document fixture not found');
        }
        await database('document_versions').insert({
            document_id: document.document_id,
            version_number: 1,
            schema_version: 1,
            created_by_user_uuid: creatorUuid,
            content: JSON.stringify({
                cells: [
                    { type: 'markdown', content: { markdown: 'ultraviolet' } },
                ],
            }),
        });
        const results = await model.searchDocuments(projectUuid, 'revenue');
        expect(results).toEqual([
            expect.objectContaining({
                uuid,
                name: 'Revenue report',
                description: 'Quarterly forecast',
                projectUuid,
                spaceUuid,
                createdBy: {
                    firstName: SEED_ORG_1_ADMIN.first_name,
                    lastName: SEED_ORG_1_ADMIN.last_name,
                    userUuid: creatorUuid,
                },
            }),
        ]);
        expect(results[0]).not.toHaveProperty('content');
        expect(await model.searchDocuments(projectUuid, 'ultraviolet')).toEqual(
            [],
        );
        await database('documents')
            .where('document_uuid', uuid)
            .update({ name: 'Retention overview' });
        expect(await model.searchDocuments(projectUuid, 'revenue')).toEqual([]);
        expect(
            await model.searchDocuments(projectUuid, 'retention'),
        ).toHaveLength(1);
        await database('documents')
            .where('document_uuid', uuid)
            .update({ description: 'Customer loyalty' });
        expect(await model.searchDocuments(projectUuid, 'forecast')).toEqual(
            [],
        );
        expect(
            await model.searchDocuments(projectUuid, 'loyalty'),
        ).toHaveLength(1);
    });

    it('excludes other projects, soft-deleted Documents and deleted parent Spaces', async () => {
        const uuid = await insertDocument();
        await insertDocument({ project_uuid: foreignProjectUuid });
        await insertDocument({ deleted_at: new Date() });
        expect(await model.searchDocuments(projectUuid, 'revenue')).toEqual([
            expect.objectContaining({ uuid }),
        ]);
        await database('spaces')
            .where('space_id', spaceId)
            .update({ deleted_at: new Date(), deleted_by_user_uuid: null });
        expect(await model.searchDocuments(projectUuid, 'revenue')).toEqual([]);
    });

    it('applies Document type, verified, creator and inclusive date filters', async () => {
        const uuid = await insertDocument();
        await insertDocument({ created_by_user_uuid: null });
        await insertDocument({ created_at: new Date('2025-01-16T00:00:00Z') });
        await insertDocument({ created_at: new Date('2025-01-14T23:59:59Z') });
        const filters = {
            type: SearchItemType.DOCUMENT,
            createdByUuid: creatorUuid,
            fromDate: '2025-01-15',
            toDate: '2025-01-15',
        };
        expect(
            await model.searchDocuments(projectUuid, 'revenue', filters),
        ).toEqual([expect.objectContaining({ uuid })]);
        expect(
            await model.searchDocuments(projectUuid, 'revenue', {
                type: SearchItemType.CHART,
            }),
        ).toEqual([]);
        expect(
            await model.searchDocuments(projectUuid, 'revenue', {
                verifiedOnly: true,
            }),
        ).toEqual([]);
        expect(
            await model.searchDocuments(projectUuid, 'revenue', {
                createdByUuid: randomUUID(),
            }),
        ).toEqual([]);
        expect(await model.searchDocuments(projectUuid, 'revenue')).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ createdBy: null }),
            ]),
        );
        await expect(
            model.searchDocuments(projectUuid, 'revenue', {
                fromDate: '2025-01-16',
                toDate: '2025-01-15',
            }),
        ).rejects.toThrow('fromDate cannot be after toDate');
    });

    it('applies inherited and direct visibility before the top ten limit', async () => {
        const visibleSpace = await createSpace();
        const visibleSpaceUuid = visibleSpace.space_uuid;
        await Promise.all(
            Array.from({ length: 12 }, () =>
                insertDocument({ name: 'Revenue', description: '' }),
            ),
        );
        const inherited = await insertDocument({
            space_id: visibleSpace.space_id,
            name: 'Inherited report',
            description: 'Revenue',
        });
        const direct = await insertDocument({
            name: 'Direct report',
            description: 'Revenue',
        });
        const inheritedResults = await model.searchDocuments(
            projectUuid,
            'revenue',
            undefined,
            {
                spaceUuids: [visibleSpaceUuid],
                documentUuids: [],
            },
        );
        expect(inheritedResults.map(({ uuid }) => uuid)).toEqual([inherited]);
        const directResults = await model.searchDocuments(
            projectUuid,
            'revenue',
            undefined,
            {
                spaceUuids: [],
                documentUuids: [direct],
            },
        );
        expect(directResults.map(({ uuid }) => uuid)).toEqual([direct]);
        const combined = await model.searchDocuments(
            projectUuid,
            'revenue',
            undefined,
            {
                spaceUuids: [visibleSpaceUuid],
                documentUuids: [inherited, direct],
            },
        );
        expect(combined.map(({ uuid }) => uuid).sort()).toEqual(
            [inherited, direct].sort(),
        );
        expect(
            await model.searchDocuments(projectUuid, 'revenue', undefined, {
                spaceUuids: [],
                documentUuids: [],
            }),
        ).toEqual([]);
    });

    it('ranks name matches above descriptions and returns a deterministic top ten', async () => {
        const descriptions = await Promise.all(
            Array.from({ length: 12 }, (_, index) =>
                insertDocument({
                    name: `Report ${index}`,
                    description: 'Revenue',
                }),
            ),
        );
        const exact = await insertDocument({
            name: 'Revenue',
            description: '',
        });
        const results = await model.searchDocuments(projectUuid, 'revenue');
        expect(results).toHaveLength(10);
        expect(results[0].uuid).toBe(exact);
        expect(results.map(({ uuid }) => uuid)).toEqual([
            exact,
            ...descriptions.sort().slice(0, 9),
        ]);
    });
});
