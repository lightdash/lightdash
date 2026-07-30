import { SEED_PROJECT } from '@lightdash/common';
import {
    expect,
    test,
    type APIRequestContext,
    type APIResponse,
    type Page,
} from '@playwright/test';
import { randomUUID } from 'node:crypto';

const apiUrl = '/api/v1';
const barColor = '#2f6bff';
const areaColor = '#2f9e44';
// Reference-line colors pass through getReadableColor, so use one that stays
// distinct from the series colors on a white background.
const referenceLineColor = '#0000ff';
const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isJsonObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const parseCreatedUuid = async (response: APIResponse) => {
    const body: unknown = await response.json();

    if (
        !isJsonObject(body) ||
        body.status !== 'ok' ||
        !isJsonObject(body.results) ||
        typeof body.results.uuid !== 'string' ||
        !uuidPattern.test(body.results.uuid)
    ) {
        throw new Error('Saved chart response did not contain a valid UUID');
    }

    return body.results.uuid;
};

const referenceLine = () => ({
    symbol: 'none',
    lineStyle: { color: referenceLineColor, width: 3, type: 'solid' },
    label: {},
    data: [
        {
            uuid: 'zorder-ref-line',
            yAxis: '5',
            name: 'Ref line',
            label: { formatter: 'Ref line' },
            lineStyle: { color: referenceLineColor },
        },
    ],
});

const barSeries = (withReferenceLine: boolean) => ({
    encode: {
        xRef: { field: 'orders_status' },
        yRef: { field: 'orders_total_order_amount' },
    },
    type: 'bar',
    yAxisIndex: 0,
    color: barColor,
    ...(withReferenceLine ? { markLine: referenceLine() } : {}),
});

const areaSeries = (withReferenceLine: boolean) => ({
    encode: {
        xRef: { field: 'orders_status' },
        yRef: { field: 'orders_average_order_size' },
    },
    type: 'line',
    areaStyle: {},
    yAxisIndex: 0,
    color: areaColor,
    ...(withReferenceLine ? { markLine: referenceLine() } : {}),
});

const createMixedChart = async (
    request: APIRequestContext,
    name: string,
    series: unknown[],
) => {
    // Two series over about five rows stay below the canvas-renderer cutoff,
    // keeping SVG document order available for the paint-order assertion.
    const response = await request.post(
        `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/saved`,
        {
            data: {
                name,
                description: 'Mixed chart z-order e2e test',
                tableName: 'orders',
                metricQuery: {
                    exploreName: 'orders',
                    dimensions: ['orders_status'],
                    metrics: [
                        'orders_total_order_amount',
                        'orders_average_order_size',
                    ],
                    filters: {},
                    sorts: [{ fieldId: 'orders_status', descending: false }],
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
                            xField: 'orders_status',
                            yField: [
                                'orders_total_order_amount',
                                'orders_average_order_size',
                            ],
                        },
                        eChartsConfig: {
                            series,
                            // Legend swatches reuse the series colors and would
                            // otherwise be mistaken for chart geometry.
                            legend: { show: false },
                        },
                    },
                },
                tableConfig: {
                    columnOrder: [
                        'orders_status',
                        'orders_total_order_amount',
                        'orders_average_order_size',
                    ],
                },
                pivotConfig: { columns: [] },
            },
        },
    );

    expect(response.status()).toBe(200);
    return parseCreatedUuid(response);
};

const deleteChart = async (request: APIRequestContext, chartUuid: string) => {
    const response = await request.delete(`${apiUrl}/saved/${chartUuid}`);
    expect(response.status()).toBe(200);
};

// Later SVG paths paint above earlier paths.
const expectPaintOrder = async (page: Page, top: 'bar' | 'area') => {
    const svg = page.locator('.echarts-for-react svg').first();
    await expect(svg).toBeVisible({ timeout: 30_000 });

    await expect
        .poll(
            () =>
                svg.evaluate(
                    (element, colors) => {
                        const indices: {
                            bar: number[];
                            area: number[];
                            referenceLine: number[];
                        } = {
                            bar: [],
                            area: [],
                            referenceLine: [],
                        };

                        element.querySelectorAll('path').forEach((path, i) => {
                            const fill = (
                                path.getAttribute('fill') ?? ''
                            ).toLowerCase();
                            const stroke = (
                                path.getAttribute('stroke') ?? ''
                            ).toLowerCase();

                            if (fill === colors.bar) {
                                indices.bar.push(i);
                            } else if (
                                fill === colors.area ||
                                stroke === colors.area
                            ) {
                                indices.area.push(i);
                            } else if (stroke === colors.referenceLine) {
                                indices.referenceLine.push(i);
                            }
                        });

                        const topIndices =
                            colors.top === 'bar' ? indices.bar : indices.area;
                        const bottomIndices =
                            colors.top === 'bar' ? indices.area : indices.bar;

                        return {
                            barRendered: indices.bar.length > 0,
                            areaRendered: indices.area.length > 0,
                            referenceLineRendered:
                                indices.referenceLine.length > 0,
                            topSeriesPaintedLast:
                                Math.min(...topIndices) >
                                Math.max(...bottomIndices),
                            referenceLinePaintedLast:
                                Math.min(...indices.referenceLine) >
                                Math.max(...indices.bar, ...indices.area),
                        };
                    },
                    {
                        bar: barColor,
                        area: areaColor,
                        referenceLine: referenceLineColor,
                        top,
                    },
                ),
            { timeout: 30_000 },
        )
        .toEqual({
            barRendered: true,
            areaRendered: true,
            referenceLineRendered: true,
            topSeriesPaintedLast: true,
            referenceLinePaintedLast: true,
        });
};

const verifyMixedChart = async (
    page: Page,
    request: APIRequestContext,
    top: 'bar' | 'area',
) => {
    // Keep the reference line on the first (bottom) series: it must still
    // paint above both series.
    const series =
        top === 'bar'
            ? [areaSeries(true), barSeries(false)]
            : [barSeries(true), areaSeries(false)];
    const chartUuid = await createMixedChart(
        request,
        `z-order e2e: ${top} listed last ${randomUUID()}`,
        series,
    );

    let verificationResult:
        | { status: 'passed' }
        | { status: 'failed'; error: unknown } = { status: 'passed' };

    try {
        const response = await page.goto(
            `/projects/${SEED_PROJECT.project_uuid}/saved/${chartUuid}`,
        );
        if (response === null || !response.ok()) {
            throw new Error(`Could not open saved chart ${chartUuid}`);
        }
        await expectPaintOrder(page, top);
    } catch (error) {
        verificationResult = { status: 'failed', error };
    }

    try {
        await deleteChart(request, chartUuid);
    } catch (cleanupError) {
        if (verificationResult.status === 'failed') {
            throw new AggregateError(
                [verificationResult.error, cleanupError],
                'Chart verification and cleanup both failed',
            );
        }
        throw cleanupError;
    }

    if (verificationResult.status === 'failed') {
        throw verificationResult.error;
    }
};

test.describe('Mixed chart series z-order', () => {
    test('paints the series listed last on top (bar last => bar over area)', async ({
        page,
        request,
    }) => {
        await verifyMixedChart(page, request, 'bar');
    });

    test('flipping the list order flips the paint order (area last => area over bar)', async ({
        page,
        request,
    }) => {
        await verifyMixedChart(page, request, 'area');
    });
});
