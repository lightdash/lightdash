import {
    getDateZoomFromRequestParameters,
    type ExecuteAsyncDashboardChartRequestParams,
    type ExecuteAsyncMetricQueryRequestParams,
    type ExecuteAsyncSqlQueryRequestParams,
} from './paginatedQuery';

const dateZoom = {
    granularity: 'MONTH',
    xAxisFieldId: 'orders_order_date_day',
};

describe('getDateZoomFromRequestParameters', () => {
    it('reads dateZoom from dashboard-chart params', () => {
        const params = {
            chartUuid: 'c',
            tileUuid: 't',
            dashboardUuid: 'd',
            dashboardFilters: {
                dimensions: [],
                metrics: [],
                tableCalculations: [],
            },
            dashboardSorts: [],
            dateZoom,
        } as unknown as ExecuteAsyncDashboardChartRequestParams;
        expect(getDateZoomFromRequestParameters(params)).toEqual(dateZoom);
    });

    it('reads dateZoom from metric-query params', () => {
        const params = {
            query: {} as ExecuteAsyncMetricQueryRequestParams['query'],
            dateZoom,
        } as ExecuteAsyncMetricQueryRequestParams;
        expect(getDateZoomFromRequestParameters(params)).toEqual(dateZoom);
    });

    it('returns undefined for a variant without dateZoom', () => {
        const params = {
            sql: 'SELECT 1',
        } as ExecuteAsyncSqlQueryRequestParams;
        expect(getDateZoomFromRequestParameters(params)).toBeUndefined();
    });

    it('returns undefined when dateZoom is absent on a dateZoom-capable variant', () => {
        const params = {
            query: {} as ExecuteAsyncMetricQueryRequestParams['query'],
        } as ExecuteAsyncMetricQueryRequestParams;
        expect(getDateZoomFromRequestParameters(params)).toBeUndefined();
    });

    it('returns undefined for undefined input', () => {
        expect(getDateZoomFromRequestParameters(undefined)).toBeUndefined();
    });
});
