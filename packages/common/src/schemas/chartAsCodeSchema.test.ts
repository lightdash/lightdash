import Ajv, { type ErrorObject } from 'ajv';
import { ContentAsCodeType } from '../types/contentAsCode/core';
import { CustomFormatType, TableCalculationTemplateType } from '../types/field';
import {
    chartAsCodeSchema,
    COMPOSER_CHART_BRANCH,
    getChartAsCodeBranchSchema,
} from './chartAsCodeSchema';

const validChart = {
    name: 'Orders',
    description: 'Orders by status',
    slug: 'orders',
    spaceSlug: 'sales',
    dashboardSlug: null,
    contentType: 'chart',
    version: 1,
    tableName: 'orders',
    metricQuery: {
        exploreName: 'orders',
        dimensions: ['orders_status'],
        metrics: [],
        filters: {},
        sorts: [],
        limit: 500,
        tableCalculations: [],
    },
    chartConfig: { type: 'table' },
};

const validSqlChart = {
    name: 'Orders by status',
    description: null,
    slug: 'orders-by-status',
    spaceSlug: 'sales',
    contentType: 'sql_chart',
    sql: 'select status, count(*) as orders from orders group by 1',
    limit: 500,
    chartKind: 'table',
    version: 1,
    config: {
        metadata: { version: 1 },
        type: 'table',
        columns: {},
        display: {},
    },
};

const validComposerChart = {
    name: 'Revenue share by status',
    description: 'Share of revenue per order status',
    slug: 'revenue-share-by-status',
    spaceSlug: 'sales',
    dashboardSlug: 'revenue-dashboard',
    contentType: 'chart',
    version: 1,
    pipeline: {
        schemaVersion: 1,
        nodes: [
            {
                sourceType: 'semanticLayer',
                nodeId: 'orders',
                exploreName: 'orders',
                dimensions: ['orders_status'],
                metrics: ['orders_total_order_amount'],
                limit: 500,
            },
            {
                sourceType: 'duckdb',
                nodeId: 'share',
                sql: 'SELECT orders_status, orders_total_order_amount / SUM(orders_total_order_amount) OVER () AS revenue_share FROM orders',
                references: ['orders'],
                limit: 100,
            },
        ],
        terminalNodeId: 'share',
    },
    chartConfig: {
        type: 'cartesian',
        config: {
            layout: {
                xField: 'composer_result_orders_status',
                yField: ['composer_result_revenue_share'],
            },
            eChartsConfig: { series: [] },
        },
    },
};

const createAjv = () =>
    new Ajv({
        strict: false,
        validateFormats: false,
        allErrors: true,
        allowUnionTypes: true,
        discriminator: true,
    });

const errorPaths = (errors: ErrorObject[] | null | undefined) =>
    (errors ?? []).map((error) =>
        error.keyword === 'required'
            ? `${error.instancePath}/${error.params.missingProperty}`
            : error.instancePath,
    );

describe('chartAsCodeSchema', () => {
    const validate = createAjv().compile(chartAsCodeSchema);

    test('accepts a semantic layer chart', () => {
        expect(validate(validChart)).toBe(true);
    });

    test('accepts a chart with a difference from previous calculation', () => {
        expect(
            validate({
                ...validChart,
                metricQuery: {
                    ...validChart.metricQuery,
                    metrics: ['orders_revenue'],
                    tableCalculations: [
                        {
                            name: 'revenue_difference',
                            displayName: 'Revenue difference',
                            template: {
                                type: TableCalculationTemplateType.DIFFERENCE_FROM_PREVIOUS,
                                fieldId: 'orders_revenue',
                                orderBy: [
                                    { fieldId: 'orders_date', order: 'asc' },
                                ],
                                partitionBy: ['orders_status'],
                            },
                            format: { type: CustomFormatType.NUMBER, round: 2 },
                        },
                    ],
                },
            }),
        ).toBe(true);
    });

    test('accepts a semantic layer chart without contentType', () => {
        const { contentType, ...chart } = validChart;
        expect(validate(chart)).toBe(true);
    });

    test('accepts a SQL chart', () => {
        expect(validate(validSqlChart)).toBe(true);
    });

    test('accepts a SQL chart without contentType', () => {
        const { contentType, ...sqlChart } = validSqlChart;
        expect(validate(sqlChart)).toBe(true);
    });

    test('reports only SQL chart errors for a SQL chart missing sql', () => {
        const { sql, ...sqlChart } = validSqlChart;
        expect(validate(sqlChart)).toBe(false);
        const paths = errorPaths(validate.errors).filter((path) => path !== '');
        expect(paths).toEqual(['/sql']);
    });

    test('an explicit contentType wins over the sql/tableName shape heuristic', () => {
        const { tableName, ...chartWithSql } = {
            ...validChart,
            sql: 'select 1',
        };
        expect(validate(chartWithSql)).toBe(false);
        const paths = errorPaths(validate.errors).filter((path) => path !== '');
        expect(paths).toEqual(['/tableName']);
        expect(validate.errors).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    keyword: 'additionalProperties',
                    params: { additionalProperty: 'sql' },
                }),
            ]),
        );
    });

    test('rejects semantic layer fields on a SQL chart', () => {
        expect(validate({ ...validSqlChart, tableName: 'orders' })).toBe(false);
        expect(validate.errors).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    keyword: 'additionalProperties',
                    params: { additionalProperty: 'tableName' },
                }),
            ]),
        );
    });

    test('reports only semantic layer chart errors for a chart missing tableName', () => {
        const { tableName, ...chart } = validChart;
        expect(validate(chart)).toBe(false);
        const paths = errorPaths(validate.errors).filter((path) => path !== '');
        expect(paths).toEqual(['/tableName']);
    });

    test('accepts a composer chart', () => {
        expect(validate(validComposerChart)).toBe(true);
    });

    test('a composer chart lives in a dashboard and carries no metric query', () => {
        const { dashboardSlug, ...withoutDashboard } = validComposerChart;
        expect(validate(withoutDashboard)).toBe(false);
        const paths = errorPaths(validate.errors).filter((path) => path !== '');
        expect(paths).toEqual(['/dashboardSlug']);
        expect(validate({ ...validComposerChart, dashboardSlug: null })).toBe(
            false,
        );
        expect(
            validate({
                ...validComposerChart,
                tableName: validChart.tableName,
                metricQuery: validChart.metricQuery,
            }),
        ).toBe(false);
    });

    test('rejects a chart file with neither a pipeline nor a metric query', () => {
        const { pipeline, ...neither } = validComposerChart;
        expect(validate(neither)).toBe(false);
    });

    test('keeps chart config definitions addressable under $defs', () => {
        expect(chartAsCodeSchema.$defs).toHaveProperty('PieChartConfig');
        expect(chartAsCodeSchema.$defs).toHaveProperty('ChartAsCode');
        expect(chartAsCodeSchema.$defs).toHaveProperty('ComposerChartAsCode');
        expect(chartAsCodeSchema.$defs).toHaveProperty('SqlChartAsCode');
    });
});

describe('getChartAsCodeBranchSchema', () => {
    const ajv = createAjv();
    const validateChart = ajv.compile(
        getChartAsCodeBranchSchema(ContentAsCodeType.CHART),
    );
    const validateSqlChart = ajv.compile(
        getChartAsCodeBranchSchema(ContentAsCodeType.SQL_CHART),
    );

    test('validates semantic layer charts only', () => {
        expect(validateChart(validChart)).toBe(true);
        expect(validateChart(validSqlChart)).toBe(false);
        expect(validateChart(validComposerChart)).toBe(false);
    });

    test('validates composer charts only, with errors scoped to the missing field', () => {
        const validateComposerChart = ajv.compile(
            getChartAsCodeBranchSchema(COMPOSER_CHART_BRANCH),
        );
        expect(validateComposerChart(validComposerChart)).toBe(true);
        expect(validateComposerChart(validChart)).toBe(false);

        const { pipeline, ...composerChart } = validComposerChart;
        expect(validateComposerChart(composerChart)).toBe(false);
        expect(errorPaths(validateComposerChart.errors)).toEqual(['/pipeline']);
    });

    test('validates SQL charts only, with errors scoped to the missing field', () => {
        expect(validateSqlChart(validSqlChart)).toBe(true);
        expect(validateSqlChart(validChart)).toBe(false);

        const { sql, ...sqlChart } = validSqlChart;
        expect(validateSqlChart(sqlChart)).toBe(false);
        expect(errorPaths(validateSqlChart.errors)).toEqual(['/sql']);
    });
});
