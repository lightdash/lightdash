import { SEED_PROJECT } from '@lightdash/common';
import { expect, test } from '../../fixtures';

const apiUrl = '/api/v1';

const createChart = async (
    request: import('@playwright/test').APIRequestContext,
    fieldX: string,
    fieldY: string,
): Promise<string> => {
    const response = await request.post(
        `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/saved`,
        {
            data: {
                name: `Chart ${fieldX} x ${fieldY}`,
                description: ``,
                tableName: 'payments',
                metricQuery: {
                    dimensions: [fieldX],
                    metrics: [fieldY],
                    filters: {},
                    sorts: [
                        {
                            fieldId: fieldX,
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
                            xField: fieldX,
                            yField: [fieldY],
                        },
                        eChartsConfig: {
                            series: [
                                {
                                    encode: {
                                        xRef: { field: fieldX },
                                        yRef: {
                                            field: fieldY,
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
                    columnOrder: [fieldX, fieldY],
                },
                pivotConfig: {
                    columns: [],
                },
            },
        },
    );
    expect(response.status()).toBe(200);
    const body = await response.json();
    return body.results.uuid;
};

test.describe('Date zoom', () => {
    test('I can use date zoom', async ({ adminPage: page }) => {
        // This barSelector will select all the blue bars in the chart
        const barSelector = 'path[fill="#5470c6"]';

        const chartUuid = await createChart(
            page.request,
            'orders_order_date_day',
            'orders_total_order_amount',
        );

        const dashResponse = await page.request.post(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/dashboards`,
            {
                data: {
                    name: 'zoom test',
                    description: '',
                    tiles: [],
                },
            },
        );
        expect(dashResponse.status()).toBe(200);
        const dashBody = await dashResponse.json();
        const dashboardUuid = dashBody.results.uuid;

        await page.request.patch(`${apiUrl}/dashboards/${dashboardUuid}`, {
            data: {
                tiles: [
                    {
                        uuid: chartUuid,
                        type: 'saved_chart',
                        properties: {
                            belongsToDashboard: false,
                            savedChartUuid: chartUuid,
                            chartName: 'test',
                        },
                        h: 9,
                        w: 15,
                        x: 0,
                        y: 0,
                    },
                ],
                filters: {
                    dimensions: [],
                    metrics: [],
                    tableCalculations: [],
                },
                name: 'zoom test',
            },
        });

        await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/dashboards/${dashboardUuid}`,
        );

        // Wait until the chart appears
        await expect(page.getByText('zoom test').first()).toBeVisible(); // dashboard title
        await expect(
            page.getByText(
                'Chart orders_order_date_day x orders_total_order_amount',
            ),
        ).toBeVisible(); // Chart title
        await expect(page.getByText('Total order amount')).toBeVisible(); // axis label

        // Count how many bars appear in the chart
        await expect(page.locator(barSelector)).toHaveCount(69); // default chart time frame is day

        await page.getByText('Date Zoom').click();
        await page.getByText('Month').click();
        await expect(page.locator(barSelector)).toHaveCount(4);

        await page.getByText('Date Zoom').click();
        await page.getByText('Day').click();
        await expect(page.locator(barSelector)).toHaveCount(69);

        await page.getByText('Date Zoom').click();
        await page.getByText('Week').click();
        await expect(page.locator(barSelector)).toHaveCount(15);

        await page.getByText('Date Zoom').click();
        await page.getByText('Quarter').click();
        await expect(page.locator(barSelector)).toHaveCount(2);

        await page.getByText('Date Zoom').click();
        await page.getByText('Year').click();
        await expect(page.locator(barSelector)).toHaveCount(1);

        await page.getByText('Date Zoom').click();
        await page.getByText('Default').click();
        await expect(page.locator(barSelector)).toHaveCount(69); // back to default (day)
    });
});
