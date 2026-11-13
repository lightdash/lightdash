import {
    DashboardTileTypes,
    QuerySourceType,
    SCREENSHOT_READY_INDICATOR_ID,
    type CreateChartInDashboard,
    type SavedChart,
} from '@lightdash/common';
import { composerChartBody } from '../../../api-tests/helpers/composerDashboard';
import {
    createComposerDashboard,
    deleteComposerDashboard,
    expect,
    json,
    loginAs,
    SEED_USERS,
    test,
    type ComposerDashboard,
} from '../../support/test';

const { pipeline, chart } = composerChartBody('');
const [node] = pipeline.nodes;
if (node.sourceType !== QuerySourceType.SEMANTIC_LAYER) {
    throw new Error('The helper chart is one semantic-layer node');
}
// Pinned so the composer node and the classic chart order their rows alike
const sorts = [{ fieldId: 'orders_status', descending: false }];

test.describe('Composer charts on dashboards', () => {
    let composer: ComposerDashboard | null = null;

    test.beforeEach(async ({ api }) => {
        await loginAs(api.raw, SEED_USERS.admin);
        composer = await createComposerDashboard(api, {
            pipeline: {
                ...pipeline,
                nodes: [{ ...node, sorts, limit: 500 }],
            },
        });
    });

    test.afterEach(async ({ api }) => {
        if (composer)
            await deleteComposerDashboard(api, composer.dashboard.uuid);
        composer = null;
    });

    test('draws the composer chart on the dashboard', async ({ page }) => {
        const { dashboard } = composer!;
        await page.goto(
            `/projects/${dashboard.projectUuid}/dashboards/${dashboard.uuid}/view`,
        );

        await expect(page.getByText('Orders', { exact: true })).toBeVisible();
        await expect(
            page
                .getByTestId('composer-chart-visualization')
                .locator('.echarts-for-react'),
        ).toBeVisible();
    });

    test('draws the composer chart on the minimal page', async ({ page }) => {
        const { dashboard } = composer!;
        await page.goto(
            `/minimal/projects/${dashboard.projectUuid}/dashboards/${dashboard.uuid}`,
        );

        await expect(
            page.locator(`#${SCREENSHOT_READY_INDICATOR_ID}`),
        ).toHaveAttribute('data-status', 'ready', { timeout: 30_000 });
        await expect(
            page.getByTestId('composer-chart-visualization'),
        ).toBeVisible();
    });

    test('a one-node semantic-layer chart draws the same chart as the classic chart with the same query', async ({
        page,
        api,
    }) => {
        const { dashboard } = composer!;
        const classicBody: CreateChartInDashboard = {
            name: 'Classic parity',
            tableName: node.exploreName,
            dashboardUuid: dashboard.uuid,
            metricQuery: {
                exploreName: node.exploreName,
                dimensions: node.dimensions,
                metrics: node.metrics,
                filters: {},
                sorts,
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: chart.chartConfig,
            tableConfig: chart.tableConfig,
        };
        const classic = await json<SavedChart>(
            await api.post(`/api/v1/projects/${dashboard.projectUuid}/saved`, {
                data: classicBody,
            }),
        );
        const [composerTile] = dashboard.tiles;
        const updated = await api.patch(
            `/api/v1/dashboards/${dashboard.uuid}`,
            {
                data: {
                    tiles: [
                        composerTile,
                        {
                            type: DashboardTileTypes.SAVED_CHART,
                            x: composerTile.w,
                            y: 0,
                            w: composerTile.w,
                            h: composerTile.h,
                            tabUuid: null,
                            properties: {
                                title: 'Classic',
                                savedChartUuid: classic.uuid,
                            },
                        },
                    ],
                    filters: dashboard.filters,
                    tabs: dashboard.tabs,
                },
            },
        );
        expect(updated.status()).toBe(200);

        await page.goto(
            `/projects/${dashboard.projectUuid}/dashboards/${dashboard.uuid}/view`,
        );
        const chartOf = (title: string) =>
            page
                .locator('.react-grid-item')
                .filter({ has: page.getByText(title, { exact: true }) })
                .locator('.echarts-for-react');
        await expect(chartOf('Orders')).toBeVisible();
        await expect(chartOf('Classic')).toBeVisible();
        // Same rows, fields and chart config draw the same pixels.
        await expect(async () => {
            expect(await chartOf('Orders').screenshot()).toEqual(
                await chartOf('Classic').screenshot(),
            );
        }).toPass({ timeout: 30_000 });
    });
});
