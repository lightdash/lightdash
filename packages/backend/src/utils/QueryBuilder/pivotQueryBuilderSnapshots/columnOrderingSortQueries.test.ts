import {
    SortByDirection,
    VizAggregationOptions,
    VizIndexType,
} from '@lightdash/common';
import { buildPivotQuery } from './helpers';

/**
 * Snapshot tests for the PROD-2927 follow-up fix: when a chart is grouped by
 * one dimension but sorted by another (e.g. group by `status`, sort by the
 * 1:1 helper `status_priority`), the pivot's column_index DENSE_RANK must
 * include the sort so new categories slot into their correct position rather
 * than appearing alphabetically at the bottom.
 */
describe('PivotQueryBuilder snapshot: column ordering sorts', () => {
    test('sort by non-pivot dimension drives column ordering', () => {
        expect(
            buildPivotQuery({
                indexColumn: [
                    { reference: 'date', type: VizIndexType.TIME },
                    {
                        reference: 'category_priority',
                        type: VizIndexType.CATEGORY,
                    },
                ],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'category' }],
                sortBy: [
                    {
                        reference: 'category_priority',
                        direction: SortByDirection.ASC,
                    },
                ],
            }),
        ).toMatchSnapshot();
    });

    test('sort by x-axis (first indexColumn) does NOT affect column ordering', () => {
        expect(
            buildPivotQuery({
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'category' }],
                sortBy: [
                    { reference: 'date', direction: SortByDirection.DESC },
                ],
            }),
        ).toMatchSnapshot();
    });

    test('sort by pivot (groupBy) dimension itself drives column ordering', () => {
        expect(
            buildPivotQuery({
                indexColumn: [{ reference: 'date', type: VizIndexType.TIME }],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'category' }],
                sortBy: [
                    { reference: 'category', direction: SortByDirection.ASC },
                ],
            }),
        ).toMatchSnapshot();
    });

    test('combined sort: x-axis + non-pivot dimension — x-axis only on row_index, other on column_index', () => {
        expect(
            buildPivotQuery({
                indexColumn: [
                    { reference: 'date', type: VizIndexType.TIME },
                    {
                        reference: 'category_priority',
                        type: VizIndexType.CATEGORY,
                    },
                ],
                valuesColumns: [
                    {
                        reference: 'revenue',
                        aggregation: VizAggregationOptions.SUM,
                    },
                ],
                groupByColumns: [{ reference: 'category' }],
                sortBy: [
                    { reference: 'date', direction: SortByDirection.DESC },
                    {
                        reference: 'category_priority',
                        direction: SortByDirection.ASC,
                    },
                ],
            }),
        ).toMatchSnapshot();
    });
});
