import {
    ChartKind,
    ChartType,
    ConflictError,
    ContentType,
    DashboardTileTypes,
    FieldType,
    NotFoundError,
    QuerySourceType,
    type ComposerChartPipeline,
    type ComposerStoredChart,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { lightdashConfigWithGoogleOAuthMock } from '../../../config/lightdashConfig.mock';
import { ComposerChartModel } from '../../../models/ComposerChartModel';
import { ContentModel } from '../../../models/ContentModel/ContentModel';
import { DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { SpaceModel } from '../../../models/SpaceModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';
import { createFixture, type Fixture } from './composerChartFixture.mock';

const pipeline = (sql: string): ComposerChartPipeline => ({
    schemaVersion: 1,
    terminalNodeId: 'orders',
    nodes: [
        {
            sourceType: QuerySourceType.SQL,
            nodeId: 'orders',
            title: 'Orders',
            sql,
        },
    ],
});

const storedChart: ComposerStoredChart = {
    schemaVersion: 1,
    columns: [
        { reference: 'status', fieldType: FieldType.DIMENSION },
        { reference: 'total', fieldType: FieldType.METRIC },
    ],
    chartConfig: {
        type: ChartType.CARTESIAN,
        config: {
            layout: { xField: 'status', yField: ['total'] },
            eChartsConfig: {},
        },
    },
    pivotConfig: null,
    tableConfig: { columnOrder: ['status', 'total'] },
};

describe('composer charts follow their dashboard on the real schema', () => {
    let migrated: MigratedDatabase;
    let database: Knex;
    let dashboardModel: DashboardModel;
    let composerChartModel: ComposerChartModel;
    let fixture: Fixture;

    const createDashboardWithChart = async (owner: Fixture = fixture) => {
        const created = await dashboardModel.create(
            owner.spaceUuid,
            {
                name: 'Composer dashboard',
                slug: `composer-dashboard-${randomUUID()}`,
                tiles: [],
                tabs: [],
            },
            { userUuid: owner.userUuid },
            owner.projectUuid,
        );
        const composerChartUuid = await composerChartModel.create({
            uuid: null,
            slug: null,
            projectUuid: owner.projectUuid,
            owner: { type: 'dashboard', dashboardUuid: created.uuid },
            name: 'Orders by status',
            description: null,
            pipeline: pipeline('select status, total from orders'),
            chart: storedChart,
            createdByUserUuid: owner.userUuid,
        });
        const dashboard = await dashboardModel.addVersion(
            created.uuid,
            {
                tiles: [
                    {
                        uuid: randomUUID(),
                        type: DashboardTileTypes.COMPOSER_CHART,
                        x: 0,
                        y: 0,
                        h: 3,
                        w: 6,
                        tabUuid: null,
                        properties: {
                            title: 'Orders',
                            composerChartUuid,
                            chartName: null,
                        },
                    },
                ],
                filters: created.filters,
                tabs: created.tabs,
            },
            { userUuid: owner.userUuid },
            owner.projectUuid,
        );
        return { dashboard, composerChartUuid };
    };

    beforeAll(async () => {
        migrated = await createMigratedDatabase();
        database = migrated.database;
        dashboardModel = new DashboardModel({ database });
        composerChartModel = new ComposerChartModel({ database });
        fixture = await createFixture(database);
    });

    afterAll(async () => {
        await migrated?.destroy();
    });

    it('soft deletes and restores the chart with its dashboard', async () => {
        const { dashboard, composerChartUuid } =
            await createDashboardWithChart();
        const deletedEarlier = await composerChartModel.create({
            uuid: null,
            slug: null,
            projectUuid: fixture.projectUuid,
            owner: { type: 'dashboard', dashboardUuid: dashboard.uuid },
            name: 'Deleted earlier',
            description: null,
            pipeline: pipeline('select 1'),
            chart: storedChart,
            createdByUserUuid: fixture.userUuid,
        });
        const someoneElse = await createFixture(database);
        await database('composer_charts')
            .where('composer_chart_uuid', deletedEarlier)
            .update({
                deleted_at: new Date(),
                deleted_by_user_uuid: someoneElse.userUuid,
            });

        await dashboardModel.softDelete(dashboard.uuid, fixture.userUuid);
        await expect(composerChartModel.get(composerChartUuid)).rejects.toThrow(
            NotFoundError,
        );

        await dashboardModel.restore(dashboard.uuid);
        await expect(
            composerChartModel.get(composerChartUuid),
        ).resolves.toMatchObject({
            owner: { type: 'dashboard', dashboardUuid: dashboard.uuid },
        });
        await expect(composerChartModel.get(deletedEarlier)).rejects.toThrow(
            NotFoundError,
        );
    });

    it('revives a deleted chart in place when an upload names its slug', async () => {
        const { dashboard: oldOwner, composerChartUuid } =
            await createDashboardWithChart();
        const { dashboard: newOwner } = await createDashboardWithChart();
        const { slug } = await composerChartModel.get(composerChartUuid);
        await dashboardModel.softDelete(oldOwner.uuid, fixture.userUuid);

        const existing = await composerChartModel.findIdentityBySlug(
            fixture.projectUuid,
            slug,
        );
        expect(existing).toEqual({
            uuid: composerChartUuid,
            deleted: true,
            owner: { type: 'dashboard', dashboardUuid: oldOwner.uuid },
        });
        await composerChartModel.writeFromCode({
            existing,
            slug,
            projectUuid: fixture.projectUuid,
            owner: { type: 'dashboard', dashboardUuid: newOwner.uuid },
            name: 'Revived',
            description: null,
            pipeline: pipeline('select status, 2 as total from orders'),
            chart: storedChart,
            createdByUserUuid: fixture.userUuid,
        });

        await expect(
            composerChartModel.get(composerChartUuid),
        ).resolves.toMatchObject({
            slug,
            name: 'Revived',
            owner: { type: 'dashboard', dashboardUuid: newOwner.uuid },
            pipeline: pipeline('select status, 2 as total from orders'),
        });
    });

    it('lists a dashboard-owned chart for code with its dashboard and space', async () => {
        const { dashboard, composerChartUuid } =
            await createDashboardWithChart();
        const { slug } = await composerChartModel.get(composerChartUuid);

        await expect(
            composerChartModel.findForCode(fixture.projectUuid, [slug]),
        ).resolves.toEqual([
            expect.objectContaining({
                uuid: composerChartUuid,
                owner: { type: 'dashboard', dashboardUuid: dashboard.uuid },
                dashboardSlug: dashboard.slug,
                spaceUuid: fixture.spaceUuid,
            }),
        ]);
    });

    const createSpaceChart = () =>
        composerChartModel.create({
            uuid: null,
            slug: null,
            projectUuid: fixture.projectUuid,
            owner: { type: 'space', spaceUuid: fixture.spaceUuid },
            name: 'In a space',
            description: null,
            pipeline: pipeline('select 1'),
            chart: storedChart,
            createdByUserUuid: fixture.userUuid,
        });

    it('lists and resolves a space-owned chart for code under its own space, with no dashboard', async () => {
        const { dashboard, composerChartUuid: dashboardChartUuid } =
            await createDashboardWithChart();
        const spaceChartUuid = await createSpaceChart();
        const { slug: dashboardChartSlug } =
            await composerChartModel.get(dashboardChartUuid);
        const { slug } = await composerChartModel.get(spaceChartUuid);
        const owner = { type: 'space', spaceUuid: fixture.spaceUuid };

        await expect(
            composerChartModel.findForCode(fixture.projectUuid, [
                slug,
                dashboardChartSlug,
            ]),
        ).resolves.toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    uuid: spaceChartUuid,
                    owner,
                    dashboardSlug: null,
                    spaceUuid: fixture.spaceUuid,
                    spacePath: 'reports',
                }),
                expect.objectContaining({
                    uuid: dashboardChartUuid,
                    dashboardSlug: dashboard.slug,
                }),
            ]),
        );
        await expect(
            composerChartModel.findBySlugs(fixture.projectUuid, [
                slug,
                dashboardChartSlug,
            ]),
        ).resolves.toEqual(
            expect.arrayContaining([
                { uuid: spaceChartUuid, slug, owner },
                {
                    uuid: dashboardChartUuid,
                    slug: dashboardChartSlug,
                    owner: { type: 'dashboard', dashboardUuid: dashboard.uuid },
                },
            ]),
        );
        await expect(
            composerChartModel.findIdentityBySlug(fixture.projectUuid, slug),
        ).resolves.toEqual({ uuid: spaceChartUuid, deleted: false, owner });
    });

    it('leaves a space-owned chart in a deleted space out of code', async () => {
        const owner = await createFixture(database);
        await composerChartModel.create({
            uuid: null,
            slug: null,
            projectUuid: owner.projectUuid,
            owner: { type: 'space', spaceUuid: owner.spaceUuid },
            name: 'In a deleted space',
            description: null,
            pipeline: pipeline('select 1'),
            chart: storedChart,
            createdByUserUuid: owner.userUuid,
        });
        await database('spaces')
            .where('space_uuid', owner.spaceUuid)
            .update({ deleted_at: new Date(), deleted_by_user_uuid: null });

        await expect(
            composerChartModel.findForCode(owner.projectUuid, undefined),
        ).resolves.toEqual([]);
    });

    // No dashboard write can reference a space's chart yet, so the tile is pointed at it directly
    const showOnDashboard = async (composerChartUuid: string) => {
        const { dashboard, composerChartUuid: ownChartUuid } =
            await createDashboardWithChart();
        await database('dashboard_tile_composer_charts')
            .where('composer_chart_uuid', ownChartUuid)
            .update({ composer_chart_uuid: composerChartUuid });
        return dashboard;
    };

    it("lists the live dashboards whose latest version shows a space's chart", async () => {
        const composerChartUuid = await createSpaceChart();
        const showing = await showOnDashboard(composerChartUuid);
        const shownEarlier = await showOnDashboard(composerChartUuid);
        await dashboardModel.addVersion(
            shownEarlier.uuid,
            {
                tiles: [],
                filters: shownEarlier.filters,
                tabs: shownEarlier.tabs,
            },
            { userUuid: fixture.userUuid },
            fixture.projectUuid,
        );
        const deleted = await showOnDashboard(composerChartUuid);
        await dashboardModel.softDelete(deleted.uuid, fixture.userUuid);

        await expect(
            composerChartModel.findDashboardsShowing(
                fixture.projectUuid,
                composerChartUuid,
            ),
        ).resolves.toEqual([
            {
                uuid: showing.uuid,
                name: showing.name,
                spaceUuid: fixture.spaceUuid,
            },
        ]);
        await expect(
            composerChartModel.findDashboardsShowing(
                randomUUID(),
                composerChartUuid,
            ),
        ).resolves.toEqual([]);
    });

    it("soft deletes a space's chart once, keeping its tiles, and refuses another space", async () => {
        const composerChartUuid = await createSpaceChart();
        await showOnDashboard(composerChartUuid);
        const other = await createFixture(database);

        await expect(
            composerChartModel.deleteFromSpace(
                composerChartUuid,
                other.spaceUuid,
                fixture.userUuid,
            ),
        ).rejects.toThrow(ConflictError);
        await composerChartModel.deleteFromSpace(
            composerChartUuid,
            fixture.spaceUuid,
            fixture.userUuid,
        );

        const row = await database('composer_charts')
            .where('composer_chart_uuid', composerChartUuid)
            .first();
        expect(row?.deleted_at).not.toBeNull();
        expect(row?.deleted_by_user_uuid).toBe(fixture.userUuid);
        await expect(
            database('dashboard_tile_composer_charts')
                .where('composer_chart_uuid', composerChartUuid)
                .pluck('composer_chart_uuid'),
        ).resolves.toEqual([composerChartUuid]);
        await expect(
            composerChartModel.deleteFromSpace(
                composerChartUuid,
                fixture.spaceUuid,
                fixture.userUuid,
            ),
        ).rejects.toThrow(ConflictError);
    });

    it("permanently deletes a space's chart with its versions", async () => {
        const composerChartUuid = await createSpaceChart();

        await composerChartModel.deleteFromSpace(
            composerChartUuid,
            fixture.spaceUuid,
            null,
        );

        await expect(
            database('composer_charts')
                .where('composer_chart_uuid', composerChartUuid)
                .first(),
        ).resolves.toBeUndefined();
        await expect(
            database('composer_chart_versions')
                .where('composer_chart_uuid', composerChartUuid)
                .first(),
        ).resolves.toBeUndefined();
    });

    it('reads a space owner', async () => {
        const composerChartUuid = await createSpaceChart();
        const owner = { type: 'space', spaceUuid: fixture.spaceUuid };

        await expect(
            composerChartModel.getOwner(composerChartUuid),
        ).resolves.toEqual({ projectUuid: fixture.projectUuid, owner });
        await expect(
            composerChartModel.get(composerChartUuid),
        ).resolves.toMatchObject({ owner });
    });

    it('revives a space-owned chart onto a dashboard, leaving one owner column', async () => {
        const { dashboard } = await createDashboardWithChart();
        const composerChartUuid = await createSpaceChart();
        const { slug } = await composerChartModel.get(composerChartUuid);
        await database('composer_charts')
            .where('composer_chart_uuid', composerChartUuid)
            .update({ deleted_at: new Date() });

        await composerChartModel.writeFromCode({
            existing: { uuid: composerChartUuid, deleted: true },
            slug,
            projectUuid: fixture.projectUuid,
            owner: { type: 'dashboard', dashboardUuid: dashboard.uuid },
            name: 'Revived',
            description: null,
            pipeline: pipeline('select 1'),
            chart: storedChart,
            createdByUserUuid: fixture.userUuid,
        });

        await expect(
            database('composer_charts')
                .select('dashboard_uuid', 'space_uuid')
                .where('composer_chart_uuid', composerChartUuid)
                .first(),
        ).resolves.toEqual({
            dashboard_uuid: dashboard.uuid,
            space_uuid: null,
        });
    });

    it('rolls a chart back to its version as of a dashboard version, to the microsecond', async () => {
        const { dashboard, composerChartUuid } =
            await createDashboardWithChart();
        // The chart version precedes the dashboard version by under a millisecond
        await database.raw(
            `UPDATE dashboard_versions SET created_at = '2026-01-01 00:00:00.123456+00' WHERE dashboard_version_uuid = ?`,
            [dashboard.versionUuid],
        );
        await database.raw(
            `UPDATE composer_chart_versions SET created_at = '2026-01-01 00:00:00.123400+00' WHERE composer_chart_uuid = ?`,
            [composerChartUuid],
        );
        const original = await composerChartModel.get(composerChartUuid);
        await database('composer_chart_versions').insert({
            composer_chart_uuid: composerChartUuid,
            pipeline: JSON.stringify(pipeline('select 2')),
            chart: JSON.stringify(storedChart),
            created_by_user_uuid: fixture.userUuid,
        });
        const someoneElse = await createFixture(database);

        await database.transaction((trx) =>
            composerChartModel.rollbackToDashboardVersion(
                composerChartUuid,
                dashboard.versionUuid,
                someoneElse.userUuid,
                trx,
            ),
        );

        const rolledBack = await composerChartModel.get(composerChartUuid);
        expect(rolledBack).toMatchObject({
            pipeline: original.pipeline,
            updatedByUserUuid: someoneElse.userUuid,
        });
        expect(rolledBack.versionUuid).not.toBe(original.versionUuid);
    });

    it("copies a dashboard's chart with its tile and a space's chart, each with its latest version, into a preview project", async () => {
        const owner = await createFixture(database);
        const { dashboard, composerChartUuid } =
            await createDashboardWithChart(owner);
        const source = await composerChartModel.get(composerChartUuid);
        const [{ organization_id: organizationId }] = await database('projects')
            .where('project_uuid', owner.projectUuid)
            .select('organization_id');
        const [{ project_uuid: previewUuid }] = await database('projects')
            .insert({
                name: 'Preview',
                organization_id: organizationId,
                project_type: 'PREVIEW',
            } as never)
            .returning('project_uuid');
        const projectModel = new ProjectModel({
            database,
            lightdashConfig: lightdashConfigWithGoogleOAuthMock,
            encryptionUtil: new EncryptionUtil({
                lightdashConfig: lightdashConfigWithGoogleOAuthMock,
            }),
        });

        const [{ composer_chart_uuid: spaceChartUuid }] = await database(
            'composer_charts',
        )
            .insert({
                project_uuid: owner.projectUuid,
                dashboard_uuid: null,
                space_uuid: owner.spaceUuid,
                name: 'Space chart',
                slug: 'space-chart',
                created_by_user_uuid: owner.userUuid,
            })
            .returning('composer_chart_uuid');
        await database('composer_chart_versions').insert({
            composer_chart_uuid: spaceChartUuid,
            pipeline: JSON.stringify(pipeline('select 1')),
            chart: JSON.stringify(storedChart),
            created_by_user_uuid: owner.userUuid,
        });

        const { spaceMapping } = await projectModel.duplicateContent(
            owner.projectUuid,
            previewUuid,
            [{ uuid: owner.spaceUuid }],
            null,
        );

        const preview = await dashboardModel.getByIdOrSlug(dashboard.slug, {
            projectUuid: previewUuid,
        });
        const [tile] = preview.tiles;
        expect(tile).toMatchObject({
            type: DashboardTileTypes.COMPOSER_CHART,
            properties: { chartName: 'Orders by status' },
        });
        const previewChartUuid =
            tile.type === DashboardTileTypes.COMPOSER_CHART
                ? tile.properties.composerChartUuid
                : null;
        expect(previewChartUuid).not.toBe(composerChartUuid);
        expect(await composerChartModel.get(previewChartUuid!)).toMatchObject({
            projectUuid: previewUuid,
            owner: { type: 'dashboard', dashboardUuid: preview.uuid },
            slug: source.slug,
            createdByUserUuid: owner.userUuid,
            pipeline: source.pipeline,
            chart: source.chart,
        });

        const [previewSpaceChart] = await database('composer_charts')
            .where({ project_uuid: previewUuid, slug: 'space-chart' })
            .select('composer_chart_uuid', 'dashboard_uuid', 'space_uuid');
        expect(previewSpaceChart).toMatchObject({
            dashboard_uuid: null,
            space_uuid: spaceMapping[0].previewSpaceUuid,
        });
        expect(
            await database('composer_chart_versions')
                .where(
                    'composer_chart_uuid',
                    previewSpaceChart.composer_chart_uuid,
                )
                .pluck('pipeline'),
        ).toEqual([pipeline('select 1')]);
    });
});

describe('space-owned composer charts follow their space on the real schema', () => {
    let migrated: MigratedDatabase;
    let database: Knex;
    let composerChartModel: ComposerChartModel;
    let spaceModel: SpaceModel;
    let contentModel: ContentModel;

    const createSpaceChart = (owner: Fixture, name = 'In a space') =>
        composerChartModel.create({
            uuid: null,
            slug: null,
            projectUuid: owner.projectUuid,
            owner: { type: 'space', spaceUuid: owner.spaceUuid },
            name,
            description: null,
            pipeline: pipeline('select 1'),
            chart: storedChart,
            createdByUserUuid: owner.userUuid,
        });

    const deletedStamp = (composerChartUuid: string) =>
        database('composer_charts')
            .select('deleted_at', 'deleted_by_user_uuid')
            .where('composer_chart_uuid', composerChartUuid)
            .first();

    beforeAll(async () => {
        migrated = await createMigratedDatabase();
        database = migrated.database;
        composerChartModel = new ComposerChartModel({ database });
        spaceModel = new SpaceModel({ database });
        contentModel = new ContentModel({ database });
    });

    afterAll(async () => {
        await migrated?.destroy();
    });

    it("takes its live charts with the space's exact time and user and restores exactly those", async () => {
        const owner = await createFixture(database);
        const other = await createFixture(database);
        const live = await createSpaceChart(owner, 'Live');
        const deletedEarlier = await createSpaceChart(owner, 'Deleted earlier');
        const elsewhere = await createSpaceChart(other, 'Elsewhere');
        const sameTimeOtherUser = await createSpaceChart(owner, 'Other user');
        await composerChartModel.deleteFromSpace(
            deletedEarlier,
            owner.spaceUuid,
            owner.userUuid,
        );
        const earlierStamp = await deletedStamp(deletedEarlier);

        const cascaded = await spaceModel.softDelete(
            owner.spaceUuid,
            owner.userUuid,
        );
        expect(cascaded.composerCharts).toEqual(
            expect.arrayContaining([
                { composerChartUuid: live, projectUuid: owner.projectUuid },
                {
                    composerChartUuid: sameTimeOtherUser,
                    projectUuid: owner.projectUuid,
                },
            ]),
        );
        expect(cascaded.composerCharts).toHaveLength(2);
        const space = await database('spaces')
            .select('deleted_at')
            .where('space_uuid', owner.spaceUuid)
            .first();
        await expect(deletedStamp(live)).resolves.toEqual({
            deleted_at: space?.deleted_at,
            deleted_by_user_uuid: owner.userUuid,
        });
        await expect(deletedStamp(deletedEarlier)).resolves.toEqual(
            earlierStamp,
        );
        await expect(deletedStamp(elsewhere)).resolves.toEqual({
            deleted_at: null,
            deleted_by_user_uuid: null,
        });
        await database('composer_charts')
            .where('composer_chart_uuid', sameTimeOtherUser)
            .update({ deleted_by_user_uuid: other.userUuid });

        const restored = await spaceModel.restore(owner.spaceUuid);
        expect(restored.composerCharts).toEqual(
            cascaded.composerCharts.filter(
                ({ composerChartUuid }) =>
                    composerChartUuid !== sameTimeOtherUser,
            ),
        );
        expect(restored.composerCharts).toHaveLength(1);
        await expect(composerChartModel.get(live)).resolves.toMatchObject({
            owner: { type: 'space', spaceUuid: owner.spaceUuid },
        });
        await expect(deletedStamp(deletedEarlier)).resolves.toEqual(
            earlierStamp,
        );
        await expect(deletedStamp(sameTimeOtherUser)).resolves.toEqual({
            deleted_at: space?.deleted_at,
            deleted_by_user_uuid: other.userUuid,
        });
    });

    it('restores a deleted chart only once its space is live, and permanently deletes only a deleted one', async () => {
        const owner = await createFixture(database);
        const chart = await createSpaceChart(owner);
        await expect(
            composerChartModel.permanentlyDeleteFromSpace(
                chart,
                owner.spaceUuid,
            ),
        ).rejects.toThrow(ConflictError);
        await composerChartModel.deleteFromSpace(
            chart,
            owner.spaceUuid,
            owner.userUuid,
        );
        await expect(composerChartModel.getDeleted(chart)).resolves.toEqual(
            expect.objectContaining({
                projectUuid: owner.projectUuid,
                owner: { type: 'space', spaceUuid: owner.spaceUuid },
                deletedByUserUuid: owner.userUuid,
            }),
        );
        await spaceModel.softDelete(owner.spaceUuid, owner.userUuid);
        await expect(
            composerChartModel.restoreToSpace(chart, owner.spaceUuid),
        ).rejects.toThrow('Restore the space first');

        await spaceModel.restore(owner.spaceUuid);
        await expect(deletedStamp(chart)).resolves.not.toMatchObject({
            deleted_at: null,
        });
        await composerChartModel.restoreToSpace(chart, owner.spaceUuid);
        await expect(composerChartModel.get(chart)).resolves.toBeTruthy();
        await expect(composerChartModel.getDeleted(chart)).rejects.toThrow(
            NotFoundError,
        );

        await composerChartModel.deleteFromSpace(
            chart,
            owner.spaceUuid,
            owner.userUuid,
        );
        await composerChartModel.permanentlyDeleteFromSpace(
            chart,
            owner.spaceUuid,
        );
        await expect(deletedStamp(chart)).resolves.toBeUndefined();
        await expect(
            database('composer_chart_versions').where(
                'composer_chart_uuid',
                chart,
            ),
        ).resolves.toEqual([]);
    });

    it('lists a deleted chart in Recently deleted by its deleter, and not one deleted with its space', async () => {
        const owner = await createFixture(database);
        const deleted = await createSpaceChart(owner, 'Deleted');
        await createSpaceChart(owner, 'Live');
        await composerChartModel.deleteFromSpace(
            deleted,
            owner.spaceUuid,
            owner.userUuid,
        );
        const findDeleted = (deletedByUserUuids?: string[]) =>
            contentModel.findDeletedContents({
                projectUuids: [owner.projectUuid],
                contentTypes: [ContentType.CHART, ContentType.COMPOSER_CHART],
                deletedByUserUuids,
                composerCharts: { allowedSpaceUuids: [] },
            });

        const { data } = await findDeleted();
        expect(data).toEqual([
            expect.objectContaining({
                uuid: deleted,
                contentType: ContentType.COMPOSER_CHART,
                chartKind: ChartKind.VERTICAL_BAR,
                spaceUuid: owner.spaceUuid,
                deletedBy: expect.objectContaining({
                    userUuid: owner.userUuid,
                }),
            }),
        ]);
        await expect(findDeleted([randomUUID()])).resolves.toMatchObject({
            data: [],
        });

        await spaceModel.softDelete(owner.spaceUuid, owner.userUuid);
        await expect(findDeleted()).resolves.toMatchObject({ data: [] });
    });
});
