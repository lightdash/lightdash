import Ajv from 'ajv';
import chartAsCodeSchema from './json/chart-as-code-1.0.json';
import dashboardAsCodeSchema from './json/dashboard-as-code-1.0.json';

const ajv = () => new Ajv({ strict: false, validateFormats: false });

const composerChartFile = {
    contentType: 'composer_chart',
    version: 1,
    slug: 'orders-by-status',
    name: 'Orders by status',
    description: null,
    dashboardSlug: 'ops',
    spaceSlug: 'jaffle',
    pipeline: {
        schemaVersion: 1,
        terminalNodeId: 'orders',
        nodes: [
            {
                sourceType: 'sql',
                nodeId: 'orders',
                title: 'Orders',
                sql: 'select status, count(*) as n from orders group by 1',
            },
        ],
    },
    chart: {
        schemaVersion: 1,
        columns: [
            { reference: 'status', fieldType: 'dimension' },
            { reference: 'n', fieldType: 'metric' },
        ],
        chartConfig: {
            type: 'data_app_viz',
            config: {
                dataAppVizSlug: 'status-donut',
                fieldMapping: { status: 'status' },
            },
        },
        pivotConfig: null,
        tableConfig: { columnOrder: ['status', 'n'] },
    },
};

const dashboardFile = (tileProperties: Record<string, unknown>) => ({
    version: 1,
    name: 'Ops',
    slug: 'ops',
    spaceSlug: 'jaffle',
    tabs: [],
    filters: { dimensions: [], metrics: [], tableCalculations: [] },
    tiles: [
        {
            type: 'composer_chart',
            x: 0,
            y: 0,
            h: 6,
            w: 12,
            properties: tileProperties,
        },
    ],
});

describe('composer charts in the content-as-code JSON schemas', () => {
    const validateChart = ajv().compile(chartAsCodeSchema);
    const validateDashboard = ajv().compile(dashboardAsCodeSchema);

    it('accepts a composer chart file, which has no tableName or metricQuery', () => {
        expect(validateChart(composerChartFile)).toBe(true);
    });

    it('checks a composer chart file against the composer shape', () => {
        const { pipeline: _pipeline, ...withoutPipeline } = composerChartFile;
        expect(validateChart(withoutPipeline)).toBe(false);
    });

    it('refuses an unknown key at the top of a composer chart file', () => {
        expect(
            validateChart({ ...composerChartFile, tableName: 'orders' }),
        ).toBe(false);
    });

    it('accepts a dashboard tile naming a composer chart by slug', () => {
        expect(
            validateDashboard(
                dashboardFile({
                    title: 'Orders',
                    chartSlug: 'orders-by-status',
                }),
            ),
        ).toBe(true);
    });

    it('refuses a composer chart tile without a chart slug', () => {
        expect(validateDashboard(dashboardFile({ title: 'Orders' }))).toBe(
            false,
        );
    });
});
