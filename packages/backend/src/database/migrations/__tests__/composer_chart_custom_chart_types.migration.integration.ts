import {
    ChartType,
    FieldType,
    QuerySourceType,
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
import { createFixture, type Fixture } from './composerChartFixture.mock';

const VIZ = randomUUID();

const customChart = (dataAppVizUuid: string): ComposerStoredChart => ({
    schemaVersion: 1,
    columns: [
        { reference: 'status', fieldType: FieldType.DIMENSION },
        { reference: 'total', fieldType: FieldType.METRIC },
    ],
    chartConfig: {
        type: ChartType.DATA_APP_VIZ,
        config: {
            dataAppVizUuid,
            dataAppVizVersion: 1,
            fieldMapping: { category: 'status', value: 'total' },
        },
    },
    pivotConfig: null,
    tableConfig: { columnOrder: ['status', 'total'] },
});

const tableChart: ComposerStoredChart = {
    ...customChart(VIZ),
    chartConfig: { type: ChartType.TABLE, config: {} },
};

describe('composer charts using a custom chart type, on the real schema', () => {
    let migrated: MigratedDatabase;
    let database: Knex;
    let dashboardModel: DashboardModel;
    let composerChartModel: ComposerChartModel;
    let fixture: Fixture;
    let admin: Fixture;

    const createDashboard = async () =>
        (
            await dashboardModel.create(
                fixture.spaceUuid,
                {
                    name: 'Composer dashboard',
                    slug: `composer-dashboard-${randomUUID()}`,
                    tiles: [],
                    tabs: [],
                },
                { userUuid: fixture.userUuid },
                fixture.projectUuid,
            )
        ).uuid;

    const createChart = (dashboardUuid: string, chart: ComposerStoredChart) =>
        composerChartModel.create({
            uuid: null,
            projectUuid: fixture.projectUuid,
            dashboardUuid,
            name: 'Orders by status',
            description: null,
            pipeline: {
                schemaVersion: 1,
                terminalNodeId: 'orders',
                nodes: [
                    {
                        sourceType: QuerySourceType.SQL,
                        nodeId: 'orders',
                        title: 'Orders',
                        sql: 'select status, total from orders',
                    },
                ],
            },
            chart,
            createdByUserUuid: fixture.userUuid,
        });

    const versionsOf = (composerChartUuid: string) =>
        database('composer_chart_versions')
            .where('composer_chart_uuid', composerChartUuid)
            .orderBy('created_at', 'asc')
            .select<
                {
                    chart: ComposerStoredChart;
                    pipeline: unknown;
                    created_by_user_uuid: string;
                }[]
            >('chart', 'pipeline', 'created_by_user_uuid');

    beforeAll(async () => {
        migrated = await createMigratedDatabase();
        database = migrated.database;
        dashboardModel = new DashboardModel({ database });
        composerChartModel = new ComposerChartModel({ database });
        fixture = await createFixture(database);
        admin = await createFixture(database);
    });

    afterAll(async () => {
        await migrated?.destroy();
    });

    it('counts only live charts on live dashboards whose current version uses the type, and moves only those', async () => {
        const dashboardUuid = await createDashboard();
        const counted = await createChart(dashboardUuid, customChart(VIZ));
        await createChart(dashboardUuid, customChart(randomUUID()));
        const deleted = await createChart(dashboardUuid, customChart(VIZ));
        await database('composer_charts')
            .where('composer_chart_uuid', deleted)
            .update({ deleted_at: new Date() });
        const movedOff = await createChart(dashboardUuid, customChart(VIZ));
        await database('composer_chart_versions').insert({
            composer_chart_uuid: movedOff,
            pipeline: JSON.stringify((await versionsOf(movedOff))[0].pipeline),
            chart: JSON.stringify(tableChart),
            created_by_user_uuid: fixture.userUuid,
        });
        const deletedDashboard = await createDashboard();
        await createChart(deletedDashboard, customChart(VIZ));
        await dashboardModel.softDelete(deletedDashboard, fixture.userUuid);

        expect(
            await composerChartModel.countUsingDataAppViz(
                fixture.projectUuid,
                VIZ,
            ),
        ).toBe(1);

        expect(
            await composerChartModel.repinUsingDataAppViz(
                fixture.projectUuid,
                VIZ,
                3,
                admin.userUuid,
            ),
        ).toBe(1);

        const [first, second] = await versionsOf(counted);
        expect(first.chart).toEqual(customChart(VIZ));
        expect(second).toEqual({
            pipeline: first.pipeline,
            chart: {
                ...customChart(VIZ),
                chartConfig: {
                    type: ChartType.DATA_APP_VIZ,
                    config: {
                        dataAppVizUuid: VIZ,
                        dataAppVizVersion: 3,
                        fieldMapping: { category: 'status', value: 'total' },
                    },
                },
            },
            created_by_user_uuid: admin.userUuid,
        });
        expect(await versionsOf(deleted)).toHaveLength(1);
        expect(await versionsOf(movedOff)).toHaveLength(2);
        expect(
            (await composerChartModel.get(counted)).chart.chartConfig,
        ).toMatchObject({ config: { dataAppVizVersion: 3 } });
    });

    it('appends nothing for a chart already on the version', async () => {
        const viz = randomUUID();
        const chart = await createChart(
            await createDashboard(),
            customChart(viz),
        );
        expect(
            await composerChartModel.repinUsingDataAppViz(
                fixture.projectUuid,
                viz,
                1,
                admin.userUuid,
            ),
        ).toBe(0);
        expect(await versionsOf(chart)).toHaveLength(1);
    });

    it("re-points a preview project's charts at the preview's copy of the type, leaving other projects alone", async () => {
        const viz = randomUUID();
        const previewViz = randomUUID();
        const chart = await createChart(
            await createDashboard(),
            customChart(viz),
        );
        await composerChartModel.remapPreviewDataAppVizs(randomUUID(), [
            {
                sourceAppUuid: viz,
                previewAppUuid: previewViz,
                previewAppVersion: 4,
            },
        ]);
        expect((await versionsOf(chart))[0].chart).toEqual(customChart(viz));

        await composerChartModel.remapPreviewDataAppVizs(fixture.projectUuid, [
            {
                sourceAppUuid: viz,
                previewAppUuid: previewViz,
                previewAppVersion: 4,
            },
        ]);
        expect((await composerChartModel.get(chart)).chart.chartConfig).toEqual(
            {
                type: ChartType.DATA_APP_VIZ,
                config: {
                    dataAppVizUuid: previewViz,
                    dataAppVizVersion: 4,
                    fieldMapping: { category: 'status', value: 'total' },
                },
            },
        );
    });
});
