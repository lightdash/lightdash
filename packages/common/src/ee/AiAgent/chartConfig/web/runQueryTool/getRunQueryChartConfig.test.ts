import { describe, expect, it } from 'vitest';
import { ChartType } from '../../../../../types/savedCharts';
import { toolRunQueryArgsSchemaTransformed } from '../../../schemas';
import { getWebAiChartConfig } from '../getWebAiChartConfig';
import { getGroupByDimensions } from '../shared/getGroupByDimensions';
import { getRunQueryChartConfig } from './getRunQueryChartConfig';

const metricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_order_date_month'],
    metrics: ['orders_revenue'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};

const queryConfig = {
    exploreName: 'orders',
    dimensions: ['orders_order_date_month'],
    metrics: ['orders_revenue'],
    sorts: [],
    limit: 500,
    parameters: null,
    customMetrics: null,
    tableCalculations: null,
    filters: null,
};

const rawSlugArgs = {
    title: 'Revenue waterfall',
    description: 'Monthly revenue through the cohort waterfall',
    queryConfig,
    chartConfig: {
        customChartTypeSlug: 'cohort-waterfall',
        fieldMapping: { x: 'orders_order_date_month', y: 'orders_revenue' },
        options: null,
    },
};

const rawPersistedArgs = {
    title: 'Revenue waterfall',
    description: 'Monthly revenue through the cohort waterfall',
    queryConfig,
    chartConfig: {
        dataAppVizUuid: 'a1b2c3d4-0000-0000-0000-000000000000',
        fieldMapping: { x: 'orders_order_date_month', y: 'orders_revenue' },
        optionValues: { showTotals: true },
    },
};

describe('getRunQueryChartConfig with a custom chart type answer', () => {
    it('returns a DATA_APP_VIZ config for the uuid-enriched persisted shape', () => {
        const queryTool =
            toolRunQueryArgsSchemaTransformed.parse(rawPersistedArgs);
        expect(
            getRunQueryChartConfig({
                queryTool,
                metricQuery,
                fieldsMap: {},
            }),
        ).toEqual({
            type: ChartType.DATA_APP_VIZ,
            config: {
                dataAppVizUuid: 'a1b2c3d4-0000-0000-0000-000000000000',
                fieldMapping: {
                    x: 'orders_order_date_month',
                    y: 'orders_revenue',
                },
                optionValues: { showTotals: true },
            },
        });
    });

    it('ignores overrideChartType for the persisted shape', () => {
        const queryTool =
            toolRunQueryArgsSchemaTransformed.parse(rawPersistedArgs);
        expect(
            getRunQueryChartConfig({
                queryTool,
                metricQuery,
                fieldsMap: {},
                overrideChartType: 'bar',
            }),
        ).toMatchObject({ type: ChartType.DATA_APP_VIZ });
    });

    it('falls back to a harmless table config for the un-enriched slug shape', () => {
        const queryTool = toolRunQueryArgsSchemaTransformed.parse(rawSlugArgs);
        expect(
            getRunQueryChartConfig({
                queryTool,
                metricQuery,
                fieldsMap: {},
            }),
        ).toMatchObject({ type: ChartType.TABLE });
    });

    it('derives no pivot dimensions for the custom branch', () => {
        const webAiChartConfig = getWebAiChartConfig({
            vizConfig: rawPersistedArgs,
            metricQuery,
            fieldsMap: {},
        });
        expect(getGroupByDimensions(webAiChartConfig)).toBeUndefined();
    });
});
