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

const rawCustomArgs = {
    title: 'Revenue waterfall',
    description: 'Monthly revenue through the cohort waterfall',
    queryConfig: {
        exploreName: 'orders',
        dimensions: ['orders_order_date_month'],
        metrics: ['orders_revenue'],
        sorts: [],
        limit: 500,
        parameters: null,
        customMetrics: null,
        tableCalculations: null,
        filters: null,
    },
    chartConfig: {
        customChartTypeSlug: 'cohort-waterfall',
        fieldMapping: { x: 'orders_order_date_month', y: 'orders_revenue' },
        options: null,
    },
};

const customQueryTool = toolRunQueryArgsSchemaTransformed.parse(rawCustomArgs);

describe('getRunQueryChartConfig with a custom chart type answer', () => {
    it('returns a harmless table config instead of throwing', () => {
        expect(
            getRunQueryChartConfig({
                queryTool: customQueryTool,
                metricQuery,
                fieldsMap: {},
            }),
        ).toMatchObject({ type: ChartType.TABLE });
    });

    it('derives no pivot dimensions for the custom branch', () => {
        const webAiChartConfig = getWebAiChartConfig({
            vizConfig: rawCustomArgs,
            metricQuery,
            fieldsMap: {},
        });
        expect(getGroupByDimensions(webAiChartConfig)).toBeUndefined();
    });
});
