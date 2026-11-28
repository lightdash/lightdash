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
import { ComposerChartModel } from '../../../models/ComposerChartModel';
import { DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import {
    down,
    up,
} from '../20261128120000_tile_composer_chart_set_null_on_delete';
import { createFixture, type Fixture } from './composerChartFixture.mock';

// Untyped on purpose: the test reads the raw schema.
const COMPOSER_CHARTS: string = 'composer_charts';
const DASHBOARD_TILE_COMPOSER_CHARTS: string = 'dashboard_tile_composer_charts';

const pipeline: ComposerChartPipeline = {
    schemaVersion: 1,
    terminalNodeId: 'orders',
    nodes: [
        {
            sourceType: QuerySourceType.SQL,
            nodeId: 'orders',
            title: 'Orders',
            sql: 'select 1',
        },
    ],
};

const storedChart: ComposerStoredChart = {
    schemaVersion: 1,
    columns: [{ reference: 'total', fieldType: FieldType.METRIC }],
    chartConfig: {
        type: ChartType.CARTESIAN,
        config: { layout: { yField: ['total'] }, eChartsConfig: {} },
    },
    pivotConfig: null,
    tableConfig: { columnOrder: ['total'] },
};

describe('a composer tile outlives its permanently deleted chart', () => {
    let migrated: MigratedDatabase;
    let database: Knex;
    let dashboardModel: DashboardModel;
    let composerChartModel: ComposerChartModel;
    let fixture: Fixture;

    const createChart = (owner: { dashboardUuid: string } | null) =>
        composerChartModel.create({
            uuid: null,
            slug: null,
            projectUuid: fixture.projectUuid,
            owner: owner
                ? { type: 'dashboard', dashboardUuid: owner.dashboardUuid }
                : { type: 'space', spaceUuid: fixture.spaceUuid },
            name: 'Orders',
            description: null,
            pipeline,
            chart: storedChart,
            createdByUserUuid: fixture.userUuid,
        });

    const composerTile = (title: string, composerChartUuid: string) => ({
        uuid: randomUUID(),
        type: DashboardTileTypes.COMPOSER_CHART as const,
        x: 0,
        y: 0,
        h: 3,
        w: 6,
        tabUuid: null,
        properties: { title, composerChartUuid, chartName: null },
    });

    /** A dashboard whose one version shows its own chart and a chart that is then permanently deleted. */
    const setUp = async () => {
        const created = await dashboardModel.create(
            fixture.spaceUuid,
            {
                name: 'Composer dashboard',
                slug: `composer-dashboard-${randomUUID()}`,
                tiles: [],
                tabs: [],
            },
            { userUuid: fixture.userUuid },
            fixture.projectUuid,
        );
        const keptUuid = await createChart({ dashboardUuid: created.uuid });
        const deletedUuid = await createChart({ dashboardUuid: created.uuid });
        const dashboard = await dashboardModel.addVersion(
            created.uuid,
            {
                tiles: [
                    composerTile('Kept', keptUuid),
                    composerTile('Gone', deletedUuid),
                ],
                filters: created.filters,
                tabs: created.tabs,
            },
            { userUuid: fixture.userUuid },
            fixture.projectUuid,
        );
        await database(COMPOSER_CHARTS)
            .where('composer_chart_uuid', deletedUuid)
            .delete();
        return { dashboard, keptUuid };
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

    it('keeps the tile with its title and no chart', async () => {
        const { dashboard } = await setUp();

        const { tiles } = await dashboardModel.getByIdOrSlug(dashboard.uuid);

        expect(tiles).toContainEqual(
            expect.objectContaining({
                type: DashboardTileTypes.COMPOSER_CHART,
                properties: expect.objectContaining({
                    title: 'Gone',
                    composerChartUuid: null,
                    chartName: null,
                }),
            }),
        );
    });

    it('still cleans up an orphan when another tile has no chart', async () => {
        const { dashboard, keptUuid } = await setUp();
        const orphanUuid = await createChart({
            dashboardUuid: dashboard.uuid,
        });

        await composerChartModel.deleteOrphans(dashboard.uuid, new Set());

        await expect(composerChartModel.get(orphanUuid)).rejects.toThrow(
            NotFoundError,
        );
        await expect(composerChartModel.get(keptUuid)).resolves.toMatchObject({
            uuid: keptUuid,
        });
    });

    it('down drops tiles with no chart and cascades again; up reverses it', async () => {
        const { dashboard, keptUuid } = await setUp();
        const trx = await database.transaction();
        try {
            const titles = () =>
                trx(DASHBOARD_TILE_COMPOSER_CHARTS)
                    .join(
                        'dashboard_versions',
                        'dashboard_versions.dashboard_version_id',
                        `${DASHBOARD_TILE_COMPOSER_CHARTS}.dashboard_version_id`,
                    )
                    .where(
                        'dashboard_versions.dashboard_version_uuid',
                        dashboard.versionUuid,
                    )
                    .pluck('title');

            await down(trx);
            expect(await titles()).toEqual(['Kept']);
            await expect(
                trx.transaction(async (afterDown) => {
                    await afterDown(COMPOSER_CHARTS)
                        .where('composer_chart_uuid', keptUuid)
                        .delete();
                    expect(await titles()).toEqual([]);
                    throw new Error('undo the delete');
                }),
            ).rejects.toThrow('undo the delete');

            await up(trx);
            await trx(COMPOSER_CHARTS)
                .where('composer_chart_uuid', keptUuid)
                .delete();
            expect(await titles()).toEqual(['Kept']);
        } finally {
            await trx.rollback();
        }
    });
});
