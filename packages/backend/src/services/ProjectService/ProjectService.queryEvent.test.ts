import {
    buildPopAdditionalMetric,
    DimensionType,
    FieldType,
    FilterOperator,
    MetricType,
    TimeFrames,
    type CompiledDimension,
    type Explore,
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

const timestampDimension: Omit<CompiledDimension, 'name' | 'label'> = {
    fieldType: FieldType.DIMENSION,
    type: DimensionType.TIMESTAMP,
    table: 'a',
    tableLabel: '',
    sql: '',
    hidden: false,
    compiledSql: '',
    tablesReferences: ['a'],
};

const optOutExplore: Explore = {
    ...validExplore,
    tables: {
        ...validExplore.tables,
        a: {
            ...validExplore.tables.a,
            dimensions: {
                ...validExplore.tables.a.dimensions,
                created: {
                    ...timestampDimension,
                    name: 'created',
                    label: 'created',
                    skipTimezoneConversion: true,
                },
                created_day: {
                    ...timestampDimension,
                    type: DimensionType.DATE,
                    name: 'created_day',
                    label: 'created day',
                    timeInterval: TimeFrames.DAY,
                    timeIntervalBaseDimensionName: 'created',
                },
            },
        },
    },
};

const filterRule = (fieldId: string) => ({
    id: fieldId,
    target: { fieldId },
    operator: FilterOperator.NOT_NULL,
});

const optOutFilters: MetricQuery['filters'] = {
    dimensions: {
        id: 'root',
        and: [
            filterRule('a_created_day'),
            filterRule('a_created'),
            filterRule('a_dim1'),
        ],
    },
};

describe('ProjectService.getMetricQueryExecutionProperties convert_timezone opt-out', () => {
    it('counts filters on opt-out dimensions and their time intervals', () => {
        expect(
            ProjectService.getMetricQueryExecutionProperties({
                metricQuery: { ...metricQuery, filters: optOutFilters },
                dateZoom: undefined,
                chartUuid: undefined,
                queryTags: {},
                explore: optOutExplore,
                parameters: undefined,
            }).convertTimezoneOptOutFiltersCount,
        ).toBe(2);
    });

    it('ignores disabled filter rules', () => {
        const disabledFilters: MetricQuery['filters'] = {
            dimensions: {
                id: 'root',
                and: [{ ...filterRule('a_created_day'), disabled: true }],
            },
        };
        expect(
            ProjectService.getMetricQueryExecutionProperties({
                metricQuery: { ...metricQuery, filters: disabledFilters },
                dateZoom: undefined,
                chartUuid: undefined,
                queryTags: {},
                explore: optOutExplore,
                parameters: undefined,
            }).convertTimezoneOptOutFiltersCount,
        ).toBe(0);
    });

    it('reports zero when no filtered dimension opts out', () => {
        expect(
            getProperties({ ...metricQuery, filters: optOutFilters })
                .convertTimezoneOptOutFiltersCount,
        ).toBe(0);
    });
});
