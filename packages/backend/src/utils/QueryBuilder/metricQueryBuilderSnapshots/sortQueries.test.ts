import { TimeFrames } from '@lightdash/common';
import {
    EXPLORE,
    METRIC_QUERY_WITH_DAY_OF_WEEK_NAME_SORT,
    METRIC_QUERY_WITH_MONTH_NAME_SORT,
} from '../MetricQueryBuilder.mock';
import { buildQuery } from './helpers';

const EXPLORE_WITH_MONTH_NAME_DIMENSION = {
    ...EXPLORE,
    tables: {
        ...EXPLORE.tables,
        table1: {
            ...EXPLORE.tables.table1,
            dimensions: {
                ...EXPLORE.tables.table1.dimensions,
                dim1: {
                    ...EXPLORE.tables.table1.dimensions.dim1,
                    timeInterval: TimeFrames.MONTH_NAME,
                },
            },
        },
    },
};

const EXPLORE_WITH_DAY_OF_WEEK_NAME_DIMENSION = {
    ...EXPLORE,
    tables: {
        ...EXPLORE.tables,
        table1: {
            ...EXPLORE.tables.table1,
            dimensions: {
                ...EXPLORE.tables.table1.dimensions,
                dim1: {
                    ...EXPLORE.tables.table1.dimensions.dim1,
                    timeInterval: TimeFrames.DAY_OF_WEEK_NAME,
                },
            },
        },
    },
};

describe('MetricQueryBuilder snapshot: sort queries', () => {
    // Covers month-name sorting, where the displayed label is textual but the SQL must order
    // by the warehouse-specific month index rather than alphabetic month names.
    test('matches snapshot for a month-name sort query', () => {
        expect(
            buildQuery({
                explore: EXPLORE_WITH_MONTH_NAME_DIMENSION,
                compiledMetricQuery: METRIC_QUERY_WITH_MONTH_NAME_SORT,
            }),
        ).toMatchSnapshot();
    });

    // Covers day-of-week-name sorting, protecting the special ordering SQL that preserves
    // weekday sequence instead of sorting day labels lexicographically.
    test('matches snapshot for a day-of-week-name sort query', () => {
        expect(
            buildQuery({
                explore: EXPLORE_WITH_DAY_OF_WEEK_NAME_DIMENSION,
                compiledMetricQuery: METRIC_QUERY_WITH_DAY_OF_WEEK_NAME_SORT,
            }),
        ).toMatchSnapshot();
    });
});
