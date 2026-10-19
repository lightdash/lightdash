import {
    FilterOperator,
    MergeJoinType,
    type MergeQuery,
} from '@lightdash/common';
import { getMergeChangeSinceRun } from './getMergeChangeSinceRun';

const metricQuery = (exploreName: string, dimensions: string[]) => ({
    exploreName,
    dimensions,
    metrics: [`${exploreName}_count`],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
});

const ran: MergeQuery = {
    sources: [
        { id: 'a', metricQuery: metricQuery('orders', ['orders_month']) },
        { id: 'b', metricQuery: metricQuery('payments', ['payments_month']) },
    ],
    joinKey: [
        {
            name: 'join_key_0',
            fieldIdBySourceId: { a: 'orders_month', b: 'payments_month' },
        },
    ],
    joinType: MergeJoinType.FULL,
    tableCalculations: [],
    sorts: [],
    limit: 500,
};

describe('getMergeChangeSinceRun', () => {
    it('reports nothing when only the sort differs', () => {
        expect(
            getMergeChangeSinceRun(ran, {
                ...ran,
                sorts: [{ fieldId: 'b_payments_count', descending: true }],
            }),
        ).toBe('none');
    });

    it('reports a join change for a new join type', () => {
        expect(
            getMergeChangeSinceRun(ran, {
                ...ran,
                joinType: MergeJoinType.LEFT,
            }),
        ).toBe('join');
    });

    it('reports a join change for a new join field', () => {
        expect(
            getMergeChangeSinceRun(ran, {
                ...ran,
                joinKey: [
                    {
                        name: 'join_key_0',
                        fieldIdBySourceId: {
                            a: 'orders_status',
                            b: 'payments_status',
                        },
                    },
                ],
            }),
        ).toBe('join');
    });

    it('reports a join change for a new limit', () => {
        expect(getMergeChangeSinceRun(ran, { ...ran, limit: 100 })).toBe(
            'join',
        );
    });

    it('reports a source change when a leg differs, even if the join also did', () => {
        expect(
            getMergeChangeSinceRun(ran, {
                ...ran,
                joinType: MergeJoinType.INNER,
                sources: [
                    ran.sources[0],
                    {
                        id: 'b',
                        metricQuery: metricQuery('payments', [
                            'payments_month',
                            'payments_status',
                        ]),
                    },
                ],
            }),
        ).toBe('sources');
    });

    // As on main: a key change never touches a filter, so it only re-runs the join
    it('reports a join change for a new join field when both sources are filtered', () => {
        const filtered = (
            id: string,
            exploreName: string,
            fieldId: string,
        ): MergeQuery['sources'][number] => ({
            id,
            metricQuery: {
                ...metricQuery(exploreName, [fieldId]),
                filters: {
                    dimensions: {
                        id: 'root',
                        and: [
                            {
                                id: 'shared',
                                target: { fieldId },
                                operator: FilterOperator.IN_BETWEEN,
                                values: ['2025-01-01', '2025-02-28'],
                            },
                        ],
                    },
                },
            },
        });
        const filteredRan: MergeQuery = {
            ...ran,
            sources: [
                filtered('a', 'orders', 'orders_month'),
                filtered('b', 'payments', 'payments_month'),
            ],
        };
        expect(
            getMergeChangeSinceRun(filteredRan, {
                ...filteredRan,
                joinKey: [
                    {
                        name: 'join_key_0',
                        fieldIdBySourceId: {
                            a: 'orders_month',
                            b: 'payments_created_month',
                        },
                    },
                ],
            }),
        ).toBe('join');
    });
});
