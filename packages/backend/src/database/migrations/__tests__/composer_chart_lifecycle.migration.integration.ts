import {
    ChartType,
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
import { DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
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
            dashboardUuid: created.uuid,
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
            dashboardUuid: dashboard.uuid,
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
        ).resolves.toMatchObject({ dashboardUuid: dashboard.uuid });
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
        expect(existing).toEqual({ uuid: composerChartUuid, deleted: true });
        await composerChartModel.writeFromCode({
            existing,
            slug,
            projectUuid: fixture.projectUuid,
            dashboardUuid: newOwner.uuid,
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
            dashboardUuid: newOwner.uuid,
            pipeline: pipeline('select status, 2 as total from orders'),
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

    it('copies the chart, its latest version and its tile into a preview project', async () => {
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

        await projectModel.duplicateContent(
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
            dashboardUuid: preview.uuid,
            slug: source.slug,
            createdByUserUuid: owner.userUuid,
            pipeline: source.pipeline,
            chart: source.chart,
        });
    });
});
