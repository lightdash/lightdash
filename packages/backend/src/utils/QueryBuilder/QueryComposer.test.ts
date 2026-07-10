import {
    PivotConfiguration,
    SortByDirection,
    VizAggregationOptions,
    VizIndexType,
} from '@lightdash/common';
import {
    EXPLORE,
    INTRINSIC_USER_ATTRIBUTES,
    METRIC_QUERY,
    QUERY_BUILDER_UTC_TIMEZONE,
    warehouseClientMock,
} from './MetricQueryBuilder.mock';
import { QueryComposer, QueryComposerContext } from './QueryComposer';

const CONTEXT: QueryComposerContext = {
    explore: EXPLORE,
    warehouseSqlBuilder: warehouseClientMock,
    intrinsicUserAttributes: INTRINSIC_USER_ATTRIBUTES,
    userAttributes: {},
    timezone: QUERY_BUILDER_UTC_TIMEZONE,
    availableParameterDefinitions: {},
    parameters: {},
    dateZoom: undefined,
    pivotDimensions: undefined,
    continueOnError: undefined,
    useTimezoneAwareDateTrunc: undefined,
    columnTimezone: undefined,
    applyDateZoomToFilters: undefined,
};

const PIVOT_CONFIGURATION: PivotConfiguration = {
    indexColumn: [{ reference: 'table1_dim1', type: VizIndexType.CATEGORY }],
    valuesColumns: [
        {
            reference: 'table1_metric1',
            aggregation: VizAggregationOptions.SUM,
        },
    ],
    groupByColumns: undefined,
    sortBy: [{ reference: 'table1_dim1', direction: SortByDirection.ASC }],
};

describe('QueryComposer', () => {
    it('compiles a metric query and returns the base SQL via getSql when there is no pivot', () => {
        const composer = new QueryComposer(
            { metricQuery: METRIC_QUERY, pivotConfiguration: undefined },
            CONTEXT,
        );

        const compiled = composer.compile();

        expect(compiled.query).toMatchSnapshot();
        expect(Object.keys(compiled.fields)).toEqual(
            expect.arrayContaining(['table1_dim1', 'table1_metric1']),
        );

        // Without a pivot configuration, getSql returns the compiled base query.
        expect(composer.getSql({ columnLimit: 100 })).toBe(compiled.query);
    });

    it('wraps the base query with the pivot query when a pivot configuration is set', () => {
        const composer = new QueryComposer(
            {
                metricQuery: METRIC_QUERY,
                pivotConfiguration: PIVOT_CONFIGURATION,
            },
            CONTEXT,
        );

        const sql = composer.getSql({ columnLimit: 100 });

        // The pivot SQL wraps (and therefore differs from) the base query.
        expect(sql).not.toBe(composer.compile().query);
        expect(sql).toMatchSnapshot();
    });
});
