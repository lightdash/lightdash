import { SEED_PROJECT } from '@lightdash/common';
import {
    expect,
    test,
    type APIRequestContext,
    type APIResponse,
    type Locator,
    type Page,
} from '@playwright/test';
import { randomUUID } from 'node:crypto';

const apiUrl = '/api/v1';
const barSelector = 'svg path[fill="#5470c6"]';
const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const emptyFilters = {
    dimensions: [],
    metrics: [],
    tableCalculations: [],
};

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const parseCreatedUuid = async (response: APIResponse, resource: string) => {
    const body: unknown = await response.json();

    if (
        !isJsonObject(body) ||
        body.status !== 'ok' ||
        !isJsonObject(body.results) ||
        typeof body.results.uuid !== 'string' ||
        !uuidPattern.test(body.results.uuid)
    ) {
        throw new Error(`${resource} response did not contain a valid UUID`);
    }

    return body.results.uuid;
};

const createDateChart = async (request: APIRequestContext, name: string) => {
    const response = await request.post(
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
                        {
                            fieldId: 'orders_order_date_day',
                            descending: true,
                        },
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

    expect(response.status()).toBe(200);
    return parseCreatedUuid(response, 'Saved chart');
};

const createDashboard = async (request: APIRequestContext, name: string) => {
    const response = await request.post(
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

    expect(response.status()).toBe(201);
    return parseCreatedUuid(response, 'Dashboard');
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

const attachDateChart = async (
    request: APIRequestContext,
    dashboardUuid: string,
    dashboardName: string,
    chartUuid: string,
    chartName: string,
    control: { uuid: string; name: string } | null,
) => {
    const tile = chartTile(chartUuid, chartName);
    const dashboard = {
        name: dashboardName,
        tiles: [tile],
        tabs: [],
        filters: emptyFilters,
    };
    const data =
        control === null
            ? dashboard
            : {
                  ...dashboard,
                  config: {
                      isDateZoomDisabled: false,
                      dateZoomConfig: {
                          controls: [
                              {
                                  uuid: control.uuid,
                                  name: control.name,
                                  granularity: 'Month',
                              },
                          ],
                          tileTargets: {
                              [tile.uuid]: {
                                  controlUuid: control.uuid,
                                  fieldId: 'orders_order_date_day',
                                  tableName: 'orders',
                              },
                          },
                      },
                  },
              };
    const response = await request.patch(
        `${apiUrl}/dashboards/${dashboardUuid}`,
        { data },
    );

    expect(response.status()).toBe(200);
};

const deleteDashboard = async (
    request: APIRequestContext,
    dashboardUuid: string,
) => {
    const response = await request.delete(
        `${apiUrl}/dashboards/${dashboardUuid}`,
    );
    expect(response.status()).toBe(200);

    const inactiveResponse = await request.get(
        `${apiUrl}/dashboards/${dashboardUuid}`,
    );
    expect(inactiveResponse.status()).toBe(404);
};

const deleteChart = async (request: APIRequestContext, chartUuid: string) => {
    const response = await request.delete(`${apiUrl}/saved/${chartUuid}`);
    expect(response.status()).toBe(200);

    const inactiveResponse = await request.get(`${apiUrl}/saved/${chartUuid}`);
    expect(inactiveResponse.status()).toBe(404);
};

const cleanup = async (
    request: APIRequestContext,
    dashboardUuid: string | null,
    chartUuid: string | null,
) => {
    try {
        if (dashboardUuid !== null) {
            await deleteDashboard(request, dashboardUuid);
        }
    } finally {
        if (chartUuid !== null) {
            await deleteChart(request, chartUuid);
        }
    }
};

const visitDashboard = async (page: Page, dashboardUuid: string) => {
    const response = await page.goto(
        `/projects/${SEED_PROJECT.project_uuid}/dashboards/${dashboardUuid}`,
    );

    if (response === null || !response.ok()) {
        throw new Error(`Could not open dashboard ${dashboardUuid}`);
    }
};

const getChartBars = async (
    page: Page,
    chartUuid: string,
    chartName: string,
) => {
    const chartTitle = page.getByRole('link', {
        name: chartName,
        exact: true,
    });
    await expect(chartTitle).toHaveAttribute(
        'href',
        `/projects/${SEED_PROJECT.project_uuid}/saved/${chartUuid}/`,
    );

    const tile = chartTitle.locator(
        'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " react-grid-item ")][1]',
    );
    await expect(tile).toHaveCount(1);
    return tile.locator(barSelector);
};

const waitForBarCount = async (
    bars: Locator,
    matches: (count: number) => boolean,
    label: string,
) => {
    let previousCount: number | null = null;
    let stableCount: number | null = null;
    await expect
        .poll(
            async () => {
                const count = await bars.count();
                const isStableMatch = count === previousCount && matches(count);
                previousCount = count;
                if (isStableMatch) {
                    stableCount = count;
                }
                return isStableMatch;
            },
            { message: `${label} bar count should stabilize` },
        )
        .toBe(true);

    if (stableCount === null) {
        throw new Error(`${label} bar count did not stabilize`);
    }
    return stableCount;
};

type DefaultGrain = 'Month' | 'Week' | 'Year' | 'None';

const selectDefaultGrain = async (page: Page, grain: DefaultGrain) => {
    await page
        .getByRole('button', { name: /^Default zoom(?: · .+)?$/ })
        .click();
    await page.getByRole('menuitem', { name: grain, exact: true }).click();
};

test.describe('Date zoom', { tag: '@mutating' }, () => {
    test('applies the Default date zoom picker to a chart', async ({
        page,
        request,
    }) => {
        const suffix = randomUUID();
        const chartName = `Date zoom default chart ${suffix}`;
        const dashboardName = `Date zoom default dashboard ${suffix}`;
        let chartUuid: string | null = null;
        let dashboardUuid: string | null = null;

        try {
            const createdChartUuid = await createDateChart(request, chartName);
            chartUuid = createdChartUuid;
            const createdDashboardUuid = await createDashboard(
                request,
                dashboardName,
            );
            dashboardUuid = createdDashboardUuid;
            await attachDateChart(
                request,
                createdDashboardUuid,
                dashboardName,
                createdChartUuid,
                chartName,
                null,
            );

            await visitDashboard(page, createdDashboardUuid);
            await expect(
                page.getByRole('heading', {
                    name: dashboardName,
                    exact: true,
                }),
            ).toBeVisible();
            const bars = await getChartBars(page, createdChartUuid, chartName);
            const dayCount = await waitForBarCount(
                bars,
                (count) => count > 0,
                'Day',
            );

            await selectDefaultGrain(page, 'Month');
            const monthCount = await waitForBarCount(
                bars,
                (count) => count > 0 && count < dayCount,
                `Month (day=${dayCount})`,
            );

            await selectDefaultGrain(page, 'Week');
            await waitForBarCount(
                bars,
                (count) => count > monthCount && count < dayCount,
                `Week (day=${dayCount}, month=${monthCount})`,
            );

            await selectDefaultGrain(page, 'Year');
            await waitForBarCount(
                bars,
                (count) => count > 0 && count < monthCount,
                `Year (month=${monthCount})`,
            );

            await selectDefaultGrain(page, 'None');
            await waitForBarCount(
                bars,
                (count) => count === dayCount,
                `None (day=${dayCount})`,
            );
        } finally {
            await cleanup(request, dashboardUuid, chartUuid);
        }
    });

    test('applies a named control grain to its attached tile and supports runtime override', async ({
        page,
        request,
    }) => {
        const suffix = randomUUID();
        const chartName = `Date zoom control chart ${suffix}`;
        const dashboardName = `Date zoom control dashboard ${suffix}`;
        const control = {
            uuid: randomUUID(),
            name: `Revenue zoom ${suffix}`,
        };
        let chartUuid: string | null = null;
        let dashboardUuid: string | null = null;

        try {
            const createdChartUuid = await createDateChart(request, chartName);
            chartUuid = createdChartUuid;
            const createdDashboardUuid = await createDashboard(
                request,
                dashboardName,
            );
            dashboardUuid = createdDashboardUuid;
            await attachDateChart(
                request,
                createdDashboardUuid,
                dashboardName,
                createdChartUuid,
                chartName,
                control,
            );

            await visitDashboard(page, createdDashboardUuid);
            await expect(
                page.getByRole('heading', {
                    name: dashboardName,
                    exact: true,
                }),
            ).toBeVisible();
            const bars = await getChartBars(page, createdChartUuid, chartName);
            const monthControl = page.getByRole('button', {
                name: `${control.name} · Month`,
                exact: true,
            });
            await expect(monthControl).toBeVisible();
            const monthCount = await waitForBarCount(
                bars,
                (count) => count > 0,
                'Named Month',
            );

            await monthControl.click();
            await page
                .getByRole('menuitem', { name: 'Week', exact: true })
                .click();
            await waitForBarCount(
                bars,
                (count) => count > monthCount,
                `Named Week (month=${monthCount})`,
            );

            await page
                .getByRole('button', {
                    name: `${control.name} · Week`,
                    exact: true,
                })
                .click();
            await page
                .getByRole('menuitem', {
                    name: 'Reset to default',
                    exact: true,
                })
                .click();
            await waitForBarCount(
                bars,
                (count) => count === monthCount,
                `Named reset (month=${monthCount})`,
            );
        } finally {
            await cleanup(request, dashboardUuid, chartUuid);
        }
    });
});
