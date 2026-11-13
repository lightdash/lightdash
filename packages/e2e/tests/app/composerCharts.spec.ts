import {
    ChartType,
    DashboardTileTypes,
    FieldType,
    FilterOperator,
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
        // Compared as drawn SVG: page screenshots differ by sub-pixel tile offsets.
        const drawingOf = (title: string) =>
            chartOf(title)
                .locator('svg')
                .first()
                .evaluate((svg) => ({
                    shapes: [...svg.querySelectorAll('path')].map(
                        (path) =>
                            `${path.getAttribute('d')} ${path.getAttribute('fill')}`,
                    ),
                    texts: [...svg.querySelectorAll('text')].map(
                        (text) => text.textContent,
                    ),
                }));
        await expect(async () => {
            const drawing = await drawingOf('Orders');
            expect(drawing.texts).toContain('completed');
            expect(drawing).toEqual(await drawingOf('Classic'));
        }).toPass({ timeout: 30_000 });
    });

    test('a dashboard filter and a parameter change the chart', async ({
        page,
        api,
    }) => {
        await deleteComposerDashboard(api, composer!.dashboard.uuid);
        composer = await createComposerDashboard(api, {
            pipeline: {
                schemaVersion: 1,
                terminalNodeId: 'orders',
                nodes: [
                    {
                        ...node,
                        dimensions: [
                            'orders_status',
                            'orders_date_custom_param_test',
                        ],
                        metrics: ['orders_unique_order_count'],
                        sorts,
                    },
                ],
            },
            chart: {
                schemaVersion: 1,
                columns: [
                    {
                        reference: 'orders_status',
                        fieldType: FieldType.DIMENSION,
                    },
                    {
                        reference: 'orders_date_custom_param_test',
                        fieldType: FieldType.DIMENSION,
                    },
                    {
                        reference: 'orders_unique_order_count',
                        fieldType: FieldType.METRIC,
                    },
                ],
                chartConfig: { type: ChartType.TABLE, config: {} },
                pivotConfig: null,
                tableConfig: { columnOrder: [] },
            },
        });
        const { dashboard } = composer;
        const tile = page.locator('.react-grid-item').filter({
            has: page.getByText('Orders', { exact: true }),
        });
        const url = `/projects/${dashboard.projectUuid}/dashboards/${dashboard.uuid}/view`;

        await page.goto(url);
        await expect(tile.getByText('shipped').first()).toBeVisible();
        await expect(tile.getByText('I feel great!!!').first()).toBeHidden();

        const updated = await api.patch(
            `/api/v1/dashboards/${dashboard.uuid}`,
            {
                data: {
                    tiles: dashboard.tiles,
                    tabs: dashboard.tabs,
                    filters: {
                        dimensions: [
                            {
                                id: 'status-filter',
                                label: undefined,
                                target: {
                                    fieldId: 'orders_status',
                                    tableName: 'orders',
                                },
                                operator: FilterOperator.EQUALS,
                                values: ['completed'],
                            },
                        ],
                        metrics: [],
                        tableCalculations: [],
                    },
                    parameters: {
                        date_custom_parameter: {
                            parameterName: 'date_custom_parameter',
                            value: '2000-01-01',
                        },
                    },
                },
            },
        );
        expect(updated.status()).toBe(200);

        await page.goto(url);
        await expect(tile.getByText('completed').first()).toBeVisible();
        await expect(tile.getByText('I feel great!!!').first()).toBeVisible();
        await expect(tile.getByText('shipped')).toHaveCount(0);
    });
});
