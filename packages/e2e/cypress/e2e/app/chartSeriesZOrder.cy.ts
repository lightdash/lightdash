import { SEED_PROJECT } from '@lightdash/common';

const apiUrl = '/api/v1';

// Distinct series colours, matched by exact hex on fill/stroke attributes.
// REF_LINE_COLOR must be high-contrast on white: reference-line colours run
// through getReadableColor, which rewrites low-contrast colours.
const BAR_COLOR = '#2f6bff';
const AREA_COLOR = '#2f9e44';
const REF_LINE_COLOR = '#0000ff';

const refLine = () => ({
    symbol: 'none',
    lineStyle: { color: REF_LINE_COLOR, width: 3, type: 'solid' },
    label: {},
    data: [
        {
            uuid: 'zorder-ref-line',
            yAxis: '5',
            name: 'Ref line',
            label: { formatter: 'Ref line' },
            lineStyle: { color: REF_LINE_COLOR },
        },
    ],
});

// The dataset is deliberately tiny (2 series x ~5 status rows) so SimpleChart
// stays on the SVG renderer (canvas kicks in above 500 data points). In SVG,
// paint order IS document order, so z-order is assertable from the DOM.
const barSeries = (withRefLine: boolean) => ({
    encode: {
        xRef: { field: 'orders_status' },
        yRef: { field: 'orders_total_order_amount' },
    },
    type: 'bar',
    yAxisIndex: 0,
    color: BAR_COLOR,
    ...(withRefLine ? { markLine: refLine() } : {}),
});

const areaSeries = (withRefLine: boolean) => ({
    encode: {
        xRef: { field: 'orders_status' },
        yRef: { field: 'orders_average_order_size' },
    },
    type: 'line',
    areaStyle: {},
    yAxisIndex: 0,
    color: AREA_COLOR,
    ...(withRefLine ? { markLine: refLine() } : {}),
});

const createMixedChart = (name: string, series: unknown[]) =>
    cy
        .request({
            url: `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/saved`,
            method: 'POST',
            body: {
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
                            // Legend swatches reuse the series colours; hide it
                            // so colour matches below only hit chart geometry.
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
        })
        .then((r) => {
            expect(r.status).to.eq(200);
            return r.body.results.uuid as string;
        });

// Document-order indices of every SVG path belonging to each series, matched
// by the distinct colours configured above. Later index = painted on top.
const paintIndices = ($svg: JQuery) => {
    const paths = Array.from($svg[0].querySelectorAll('path'));
    const indices = {
        bar: [] as number[],
        area: [] as number[],
        ref: [] as number[],
    };
    paths.forEach((el, i) => {
        const fill = (el.getAttribute('fill') ?? '').toLowerCase();
        const stroke = (el.getAttribute('stroke') ?? '').toLowerCase();
        if (fill === BAR_COLOR) indices.bar.push(i);
        else if (fill === AREA_COLOR || stroke === AREA_COLOR)
            indices.area.push(i);
        else if (stroke === REF_LINE_COLOR) indices.ref.push(i);
    });
    return indices;
};

const visitChart = (chartUuid: string) => {
    cy.visit(`/projects/${SEED_PROJECT.project_uuid}/saved/${chartUuid}`);
    cy.contains('Loading chart').should('not.exist');
};

// Assert that the series listed last paints on top and the reference line
// paints above all series, from SVG document order (later element = on top).
const assertPaintOrder = (top: 'bar' | 'area') =>
    cy.get('.echarts-for-react svg', { timeout: 30000 }).should(($svg) => {
        const { bar, area, ref } = paintIndices($svg);
        expect(bar, 'bar paths rendered').to.have.length.greaterThan(0);
        expect(area, 'area paths rendered').to.have.length.greaterThan(0);
        expect(ref, 'reference line rendered').to.have.length.greaterThan(0);

        const [topIndices, bottomIndices] =
            top === 'bar' ? [bar, area] : [area, bar];
        expect(
            Math.min(...topIndices),
            `${top} (listed last) painted on top`,
        ).to.be.greaterThan(Math.max(...bottomIndices));
        expect(
            Math.min(...ref),
            'reference line painted on top of all series',
        ).to.be.greaterThan(Math.max(...bar, ...area));
    });

describe('Mixed chart series z-order', () => {
    const createdChartUuids: string[] = [];

    beforeEach(() => {
        cy.login();
    });

    after(() => {
        cy.login();
        createdChartUuids.forEach((uuid) => {
            cy.request({
                url: `${apiUrl}/saved/${uuid}`,
                method: 'DELETE',
                failOnStatusCode: false,
            });
        });
    });

    it('paints the series listed last on top (bar last => bar over area)', () => {
        // Ref line hosted on the FIRST (bottom) series: it must still paint on
        // top of everything, since markLine z stays above all series z.
        createMixedChart('zorder e2e: bar listed last', [
            areaSeries(true),
            barSeries(false),
        ]).then((chartUuid) => {
            createdChartUuids.push(chartUuid);
            visitChart(chartUuid);
            assertPaintOrder('bar');
        });
    });

    it('flipping the list order flips the paint order (area last => area over bar)', () => {
        createMixedChart('zorder e2e: area listed last', [
            barSeries(true),
            areaSeries(false),
        ]).then((chartUuid) => {
            createdChartUuids.push(chartUuid);
            visitChart(chartUuid);
            assertPaintOrder('area');
        });
    });
});
