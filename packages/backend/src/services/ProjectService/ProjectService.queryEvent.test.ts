import {
    buildPopAdditionalMetric,
    MetricType,
    TimeFrames,
    type MetricQuery,
} from '@lightdash/common';
import { ProjectService } from './ProjectService';
import { validExplore } from './ProjectService.mock';

const { additionalMetric: popMetric, metricId: popMetricId } =
    buildPopAdditionalMetric({
        metric: {
            table: 'a',
            name: 'met1',
            label: 'met1',
            description: undefined,
            type: MetricType.COUNT,
            sql: '${TABLE}.id',
            round: undefined,
            compact: undefined,
            format: undefined,
            formatOptions: undefined,
            distinctKeys: undefined,
        },
        timeDimensionId: 'a_dim1',
        granularity: TimeFrames.DAY,
        periodOffset: 1,
    });

const metricQuery: MetricQuery = {
    exploreName: 'valid_explore',
    dimensions: ['a_dim1'],
    metrics: ['a_met1'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};

const getProperties = (query: MetricQuery) =>
    ProjectService.getMetricQueryExecutionProperties({
        metricQuery: query,
        dateZoom: undefined,
        chartUuid: undefined,
        queryTags: {},
        explore: validExplore,
        parameters: undefined,
    });

describe('ProjectService.getMetricQueryExecutionProperties period-over-period', () => {
    it('counts selected period-over-period metrics', () => {
        expect(
            getProperties({
                ...metricQuery,
                metrics: ['a_met1', popMetricId],
                additionalMetrics: [popMetric],
            }),
        ).toMatchObject({
            additionalMetricsCount: 1,
            periodOverPeriodMetricsCount: 1,
        });
    });

    it('reports zero when the query has no period-over-period metrics', () => {
        expect(getProperties(metricQuery)).toMatchObject({
            periodOverPeriodMetricsCount: 0,
        });
    });
});
