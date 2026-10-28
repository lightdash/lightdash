import { SEED_PROJECT } from '@lightdash/common';
import {
    expect,
    json,
    loginAs,
    SEED_USERS,
    test,
    TrackedApi,
    type Page,
} from '../../support/test';

const apiUrl = '/api/v1';

// All blue bars in an ECharts cartesian chart.
const barSelector = 'path[fill="#5470c6"]';

const emptyFilters = {
    dimensions: [],
    metrics: [],
    tableCalculations: [],
};

// Create a standalone bar chart over a day-grained date dimension and return its uuid.
const createDateChart = async (api: TrackedApi, name: string) => {
    const r = await api.post(
        `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/saved`,
        {
            data: {
                name,
                description: '',
                tableName: 'orders',
                metricQuery: {
                    exploreName: 'orders',
                    dimensions: ['orders_order_date_day'],
                    metrics: ['orders_total_order_amount'],
                    filters: {},
                    sorts: [
                        { fieldId: 'orders_order_date_day', descending: true },
                    ],
                    limit: 500,
                    tableCalculations: [],
                    additionalMetrics: [],
                    customDimensions: [],
                },
                chartConfig: {
                    type: 'cartesian',
                    config: {
                        layout: {
                            flipAxes: false,
                            xField: 'orders_order_date_day',
                            yField: ['orders_total_order_amount'],
                        },
                        eChartsConfig: {
                            series: [
                                {
                                    encode: {
                                        xRef: {
                                            field: 'orders_order_date_day',
                                        },
                                        yRef: {
                                            field: 'orders_total_order_amount',
                                        },
                                    },
                                    type: 'bar',
                                    yAxisIndex: 0,
                                },
                            ],
                        },
                    },
                },
                tableConfig: {
                    columnOrder: [
                        'orders_order_date_day',
                        'orders_total_order_amount',
                    ],
                },
                pivotConfig: { columns: [] },
            },
        },
    );
    expect(r.status()).toBe(200);
    return (await json<{ uuid: string }>(r)).uuid;
};

const createDashboard = async (api: TrackedApi, name: string) => {
    const r = await api.post(
        `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/dashboards`,
        {
            data: {
                name,
                description: '',
                tiles: [],
                tabs: [],
            },
        },
    );
    return (await json<{ uuid: string }>(r)).uuid;
};

const chartTile = (chartUuid: string, chartName: string) => ({
    uuid: chartUuid,
    type: 'saved_chart',
    properties: {
        belongsToDashboard: false,
        savedChartUuid: chartUuid,
        chartName,
    },
    h: 9,
    w: 15,
    x: 0,
    y: 0,
});

const visitDashboard = (page: Page, dashboardUuid: string) =>
    page.goto(
        `/projects/${SEED_PROJECT.project_uuid}/dashboards/${dashboardUuid}`,
    );

// Bar counts depend on seed row counts, so assert on granularity ordering
// (coarser grain => fewer bars) instead of brittle absolute numbers.
const expectBarCount = async (
    page: Page,
    assert: (count: number) => void,
): Promise<number> => {
    let count = 0;
    await expect(async () => {
        count = await page.locator(barSelector).count();
        assert(count);
    }).toPass();
    return count;
};

test.describe('Date zoom', () => {
    test.beforeEach(async ({ api }) => {
        await loginAs(api.raw, SEED_USERS.admin);
    });

    test('applies the Default date zoom picker to a chart', async ({
        page,
        api,
    }) => {
        const chartName = 'Date zoom default chart';
        const selectDefaultGrain = async (grain: string) => {
            await page.getByText('Default zoom').click();
            await page.getByText(grain, { exact: true }).click();
        };

        const chartUuid = await createDateChart(api, chartName);
        const dashboardUuid = await createDashboard(api, 'zoom test');
        await api.patch(`${apiUrl}/dashboards/${dashboardUuid}`, {
            data: {
                name: 'zoom test',
                tiles: [chartTile(chartUuid, chartName)],
                tabs: [],
                filters: emptyFilters,
            },
        });
        await visitDashboard(page, dashboardUuid);

        await expect(page.getByText('zoom test').first()).toBeVisible(); // dashboard title
        await expect(page.getByText(chartName).first()).toBeVisible(); // chart tile title

        // The chart's own granularity is day.
        const dayCount = await expectBarCount(page, (count) => {
            expect(count).toBeGreaterThan(0);
        });

        // Month is coarser than day => fewer bars.
        await selectDefaultGrain('Month');
        const monthCount = await expectBarCount(page, (count) => {
            expect(count).toBeGreaterThan(0);
            expect(count).toBeLessThan(dayCount);
        });

        // Week sits between month and day.
        await selectDefaultGrain('Week');
        await expectBarCount(page, (count) => {
            expect(count).toBeGreaterThan(monthCount);
            expect(count).toBeLessThan(dayCount);
        });

        // Year is the coarsest => fewer bars than month.
        await selectDefaultGrain('Year');
        await expectBarCount(page, (count) => {
            expect(count).toBeGreaterThan(0);
            expect(count).toBeLessThan(monthCount);
        });

        // None resets back to the chart's native day granularity.
        await selectDefaultGrain('None');
        await expectBarCount(page, (count) => {
            expect(count).toBe(dayCount);
        });
    });

    test('applies a named control grain to its attached tile and supports runtime override', async ({
        page,
        api,
    }) => {
        const chartName = 'Date zoom control chart';
        const controlUuid = crypto.randomUUID();
        const controlName = 'Revenue zoom';

        const chartUuid = await createDateChart(api, chartName);
        const dashboardUuid = await createDashboard(api, 'control zoom test');
        await api.patch(`${apiUrl}/dashboards/${dashboardUuid}`, {
            data: {
                name: 'control zoom test',
                tiles: [chartTile(chartUuid, chartName)],
                tabs: [],
                filters: emptyFilters,
                config: {
                    isDateZoomDisabled: false,
                    dateZoomConfig: {
                        controls: [
                            {
                                uuid: controlUuid,
                                name: controlName,
                                granularity: 'Month',
                            },
                        ],
                        tileTargets: {
                            [chartUuid]: {
                                controlUuid,
                                fieldId: 'orders_order_date_day',
                                tableName: 'orders',
                            },
                        },
                    },
                },
            },
        });
        await visitDashboard(page, dashboardUuid);

        await expect(page.getByText('control zoom test').first()).toBeVisible();
        await expect(page.getByText(chartName).first()).toBeVisible();

        // The persisted control renders as a pill at its saved
        // grain (Month), applied on load without the Default picker.
        const controlPill = page.getByText(controlName).first();
        await expect(controlPill).toContainText('Month');

        const monthCount = await expectBarCount(page, (count) => {
            expect(count).toBeGreaterThan(0);
        });

        // A viewer overrides the control grain at runtime via its
        // pill; Week is finer than Month => more bars.
        await controlPill.click();
        await page.getByText('Week', { exact: true }).click();
        await expectBarCount(page, (count) => {
            expect(count).toBeGreaterThan(monthCount);
        });

        // Reset returns the control to its persisted default (Month).
        await controlPill.click();
        await page.getByText('Reset to default').click();
        await expectBarCount(page, (count) => {
            expect(count).toBe(monthCount);
        });
    });
});
