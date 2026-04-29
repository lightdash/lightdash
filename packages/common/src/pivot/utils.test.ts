import { VizAggregationOptions } from '../visualizations/types';
import { isSortedByPivot } from './utils';

describe('isSortedByPivot', () => {
    it('returns false when there are no pivot dimensions', () => {
        expect(
            isSortedByPivot({
                pivotDimensions: [],
                sorts: [{ fieldId: 'orders_status' }],
                pivotDetails: null,
            }),
        ).toBe(false);

        expect(
            isSortedByPivot({
                pivotDimensions: undefined,
                sorts: [{ fieldId: 'orders_status' }],
                pivotDetails: null,
            }),
        ).toBe(false);
    });

    it('returns false when there are no sorts', () => {
        expect(
            isSortedByPivot({
                pivotDimensions: ['orders_status'],
                sorts: [],
                pivotDetails: null,
            }),
        ).toBe(false);

        expect(
            isSortedByPivot({
                pivotDimensions: ['orders_status'],
                sorts: undefined,
                pivotDetails: null,
            }),
        ).toBe(false);
    });

    it('returns true when sort field matches a pivot dimension', () => {
        expect(
            isSortedByPivot({
                pivotDimensions: ['orders_status'],
                sorts: [{ fieldId: 'orders_status' }],
                pivotDetails: null,
            }),
        ).toBe(true);
    });

    it('returns true when sort field matches a sort-only dimension in pivotDetails', () => {
        expect(
            isSortedByPivot({
                pivotDimensions: ['orders_status'],
                sorts: [{ fieldId: 'raw_order_statuses_status_priority' }],
                pivotDetails: {
                    sortOnlyColumns: [
                        { reference: 'raw_order_statuses_status_priority' },
                    ],
                },
            }),
        ).toBe(true);
    });

    it('returns false when sort-only column is a metric (has aggregation), not a dimension', () => {
        expect(
            isSortedByPivot({
                pivotDimensions: ['orders_status'],
                sorts: [{ fieldId: 'hidden_metric' }],
                pivotDetails: {
                    sortOnlyColumns: [
                        {
                            reference: 'hidden_metric',
                            aggregation: VizAggregationOptions.SUM,
                        },
                    ],
                },
            }),
        ).toBe(false);
    });

    it('returns false when sort field is unrelated to pivot dimensions or sort-only dimensions', () => {
        expect(
            isSortedByPivot({
                pivotDimensions: ['orders_status'],
                sorts: [{ fieldId: 'orders_total_revenue' }],
                pivotDetails: {
                    sortOnlyColumns: [{ reference: 'some_other_dim' }],
                },
            }),
        ).toBe(false);
    });

    it('returns true when at least one sort matches even if others do not', () => {
        expect(
            isSortedByPivot({
                pivotDimensions: ['orders_status'],
                sorts: [
                    { fieldId: 'orders_total_revenue' },
                    { fieldId: 'orders_status' },
                ],
                pivotDetails: null,
            }),
        ).toBe(true);
    });

    it('handles missing pivotDetails (null and undefined) by only checking pivot dimensions', () => {
        expect(
            isSortedByPivot({
                pivotDimensions: ['orders_status'],
                sorts: [{ fieldId: 'orders_status' }],
                pivotDetails: null,
            }),
        ).toBe(true);

        expect(
            isSortedByPivot({
                pivotDimensions: ['orders_status'],
                sorts: [{ fieldId: 'orders_status' }],
                pivotDetails: undefined,
            }),
        ).toBe(true);

        expect(
            isSortedByPivot({
                pivotDimensions: ['orders_status'],
                sorts: [{ fieldId: 'sort_only_dim' }],
                pivotDetails: null,
            }),
        ).toBe(false);
    });

    it('mixes sort-only dimensions and metrics in sortOnlyColumns and only treats dimensions as pivot-driving', () => {
        const pivotDetails = {
            sortOnlyColumns: [
                {
                    reference: 'hidden_metric',
                    aggregation: VizAggregationOptions.SUM,
                },
                { reference: 'companion_dim' },
            ],
        };

        expect(
            isSortedByPivot({
                pivotDimensions: ['orders_status'],
                sorts: [{ fieldId: 'companion_dim' }],
                pivotDetails,
            }),
        ).toBe(true);

        expect(
            isSortedByPivot({
                pivotDimensions: ['orders_status'],
                sorts: [{ fieldId: 'hidden_metric' }],
                pivotDetails,
            }),
        ).toBe(false);
    });
});
