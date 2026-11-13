import { FilterOperator, type MetricQuery } from '@lightdash/common';
import { getAnalyticsActivityWindow } from './getAnalyticsActivityWindow';

const start = {
    id: 'start',
    target: { fieldId: 'user_activity_activity_date_day' },
    operator: FilterOperator.GREATER_THAN_OR_EQUAL,
    values: ['2026-11-06'],
};
const end = {
    ...start,
    id: 'end',
    operator: FilterOperator.LESS_THAN,
    values: ['2026-11-13'],
};
const query: MetricQuery = {
    exploreName: 'user_activity',
    dimensions: [],
    metrics: ['user_activity_unique_users'],
    sorts: [],
    tableCalculations: [],
    limit: 1,
    filters: { dimensions: { id: 'range', and: [start, end] } },
};

describe('analytics activity partition window', () => {
    it('extracts the exact half-open UTC date range', () => {
        expect(getAnalyticsActivityWindow(query, 'UTC')).toEqual({
            start: '2026-11-06',
            end: '2026-11-13',
        });
    });

    it('keeps all partitions for ambiguous or invalid filters', () => {
        expect(
            getAnalyticsActivityWindow(query, 'America/New_York'),
        ).toBeUndefined();
        expect(getAnalyticsActivityWindow(query, undefined)).toBeUndefined();
        expect(
            getAnalyticsActivityWindow(
                {
                    ...query,
                    filters: { dimensions: { id: 'or', or: [start, end] } },
                },
                'UTC',
            ),
        ).toBeUndefined();
        expect(
            getAnalyticsActivityWindow(
                {
                    ...query,
                    filters: {
                        dimensions: {
                            id: 'range',
                            and: [start, { ...end, values: ['2026-11-31'] }],
                        },
                    },
                },
                'UTC',
            ),
        ).toBeUndefined();
    });
});
