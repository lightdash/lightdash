import {
    MAX_MERGE_TABLE_CALCULATION_FORMULA_LENGTH,
    MergeJoinType,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    parseMergeState,
    serializeMergeState,
    type MergeUrlState,
} from './mergeUrlState';

const state: MergeUrlState = {
    focus: { kind: 'source', sourceId: 'subscriptions' },
    primarySourceName: null,
    additionalSources: [
        {
            id: 'subscriptions',
            exploreName: 'subscriptions',
            dimensions: ['subscriptions_subscription_start_month'],
            metrics: ['subscriptions_total_subscriptions'],
            filters: {},
        },
    ],
    joinParts: [
        {
            fieldIdBySourceId: {
                a: 'orders_order_date_month',
                subscriptions: 'subscriptions_subscription_start_month',
            },
        },
        {
            fieldIdBySourceId: {
                a: 'orders_status',
                subscriptions: 'subscriptions_status',
            },
        },
    ],
    joinType: MergeJoinType.LEFT,
    repeatValuesSourceIds: [],
    tableCalculations: [],
};

describe('merge url state', () => {
    it('round-trips source-addressed editor state', () => {
        expect(parseMergeState(serializeMergeState(state))).toEqual(state);
    });

    it('round-trips merge-level formulas', () => {
        const withCalculation: MergeUrlState = {
            ...state,
            tableCalculations: [
                {
                    name: 'conversion_rate',
                    displayName: 'Conversion rate',
                    sql: '',
                    formula:
                        '=orders_orders_total / subscriptions_subscriptions_total',
                },
            ],
        };

        expect(parseMergeState(serializeMergeState(withCalculation))).toEqual(
            withCalculation,
        );
    });

    it('rejects malformed or oversized calculations from the URL', () => {
        const serialized = JSON.parse(serializeMergeState(state));
        const calculation = {
            name: 'rate',
            displayName: 'Rate',
            sql: '',
            formula: '=1',
        };

        expect(
            parseMergeState(
                JSON.stringify({
                    ...serialized,
                    t: [{ ...calculation, formula: 1 }],
                }),
            ),
        ).toBeNull();
        expect(
            parseMergeState(
                JSON.stringify({
                    ...serialized,
                    t: [
                        {
                            ...calculation,
                            formula: 'x'.repeat(
                                MAX_MERGE_TABLE_CALCULATION_FORMULA_LENGTH + 1,
                            ),
                        },
                    ],
                }),
            ),
        ).toBeNull();
    });

    it('keeps only known calculation fields from the URL', () => {
        const serialized = JSON.parse(serializeMergeState(state));

        expect(
            parseMergeState(
                JSON.stringify({
                    ...serialized,
                    t: [
                        {
                            name: 'rate',
                            displayName: 'Rate',
                            sql: '',
                            formula: '=1',
                            arbitrary: { payload: true },
                        },
                    ],
                }),
            )?.tableCalculations,
        ).toEqual([
            {
                name: 'rate',
                displayName: 'Rate',
                sql: '',
                formula: '=1',
            },
        ]);
    });

    it('round-trips which sources repeat their values and drops unknown ones', () => {
        const repeating = {
            ...state,
            repeatValuesSourceIds: ['subscriptions'],
        };
        expect(parseMergeState(serializeMergeState(repeating))).toEqual(
            repeating,
        );

        const serialized = JSON.parse(serializeMergeState(repeating));
        expect(
            parseMergeState(
                JSON.stringify({ ...serialized, r: ['subscriptions', 'z'] }),
            ),
        ).toEqual(repeating);
        expect('r' in JSON.parse(serializeMergeState(state))).toBe(false);
    });

    it('round-trips the relationship step', () => {
        const relationshipState = {
            ...state,
            focus: { kind: 'join' as const },
        };

        expect(parseMergeState(serializeMergeState(relationshipState))).toEqual(
            relationshipState,
        );
    });

    it('returns null when there is no merge in the url', () => {
        expect(parseMergeState(null)).toBeNull();
        expect(parseMergeState('')).toBeNull();
    });

    it('returns null for malformed JSON or a non-object value', () => {
        expect(parseMergeState('not json')).toBeNull();
        expect(parseMergeState('{oops')).toBeNull();
        expect(parseMergeState('"a string"')).toBeNull();
        expect(parseMergeState('null')).toBeNull();
    });

    it('adapts legacy two-source links at the URL boundary', () => {
        const parsed = parseMergeState(
            JSON.stringify({
                e: 'subscriptions',
                d: ['subscriptions_month', 3, null],
                m: ['subscriptions_mrr'],
                k: [
                    ['orders_month', 'subscriptions_month'],
                    'invalid',
                    [1, 'subscriptions_status'],
                ],
                j: MergeJoinType.LEFT,
                w: {},
                f: 'b',
            }),
        );

        expect(parsed).toEqual({
            focus: { kind: 'source', sourceId: 'b' },
            primarySourceName: null,
            additionalSources: [
                {
                    id: 'b',
                    exploreName: 'subscriptions',
                    dimensions: ['subscriptions_month'],
                    metrics: ['subscriptions_mrr'],
                    filters: {},
                    additionalMetrics: undefined,
                    customDimensions: undefined,
                },
            ],
            joinParts: [
                {
                    fieldIdBySourceId: {
                        a: 'orders_month',
                        b: 'subscriptions_month',
                    },
                },
                {
                    fieldIdBySourceId: {
                        a: null,
                        b: 'subscriptions_status',
                    },
                },
            ],
            joinType: MergeJoinType.LEFT,
            repeatValuesSourceIds: [],
            tableCalculations: [],
        });
    });

    it('falls back to safe defaults for an empty legacy shape', () => {
        expect(parseMergeState('{}')).toEqual({
            focus: { kind: 'source', sourceId: 'a' },
            primarySourceName: null,
            additionalSources: [
                {
                    id: 'b',
                    exploreName: null,
                    dimensions: [],
                    metrics: [],
                    filters: {},
                    additionalMetrics: undefined,
                    customDimensions: undefined,
                },
            ],
            joinParts: [{ fieldIdBySourceId: { a: null, b: null } }],
            joinType: MergeJoinType.FULL,
            repeatValuesSourceIds: [],
            tableCalculations: [],
        });
    });

    it('rejects malformed current sources', () => {
        expect(parseMergeState(JSON.stringify({ s: [{}] }))).toBeNull();
        expect(parseMergeState(JSON.stringify({ s: [] }))).toBeNull();
        expect(
            parseMergeState(
                JSON.stringify({
                    s: [
                        { i: 'b', e: null, d: [], m: [], w: {} },
                        { i: 'c', e: null, d: [], m: [], w: {} },
                    ],
                }),
            ),
        ).toBeNull();
    });
});
