import { MergeJoinType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    parseMergeState,
    serializeMergeState,
    type MergeUrlState,
} from './mergeUrlState';

const state: MergeUrlState = {
    focus: 'b',
    queryB: {
        exploreName: 'subscriptions',
        dimensions: ['subscriptions_subscription_start_month'],
        metrics: ['subscriptions_total_subscriptions'],
    },
    joinParts: [
        {
            fieldA: 'orders_order_date_month',
            fieldB: 'subscriptions_subscription_start_month',
        },
        { fieldA: 'orders_status', fieldB: 'subscriptions_status' },
    ],
    joinType: MergeJoinType.LEFT,
    filtersB: {},
};

describe('merge url state', () => {
    it('round-trips the whole relationship', () => {
        expect(parseMergeState(serializeMergeState(state))).toEqual(state);
    });

    it('round-trips the combine step', () => {
        const combineState = { ...state, focus: 'join' as const };

        expect(parseMergeState(serializeMergeState(combineState))).toEqual(
            combineState,
        );
    });

    it('returns null when there is no merge in the url', () => {
        expect(parseMergeState(null)).toBeNull();
        expect(parseMergeState('')).toBeNull();
    });

    // A shared link can be stale or hand-edited. Dropping back to the ordinary
    // explorer is the right failure; throwing away the page is not.
    it('returns null for anything that is not JSON', () => {
        expect(parseMergeState('not json')).toBeNull();
        expect(parseMergeState('{oops')).toBeNull();
    });

    it('returns null for JSON that is not an object', () => {
        expect(parseMergeState('"a string"')).toBeNull();
        expect(parseMergeState('null')).toBeNull();
    });

    it('falls back to safe defaults for missing or wrong-typed fields', () => {
        expect(parseMergeState('{}')).toEqual({
            focus: 'a',
            queryB: { exploreName: null, dimensions: [], metrics: [] },
            // A merge always has at least one key part, even an unfilled one.
            joinParts: [{ fieldA: null, fieldB: null }],
            joinType: MergeJoinType.FULL,
            filtersB: {},
        });
    });

    it('drops non-string entries rather than carrying them into a query', () => {
        const parsed = parseMergeState(
            JSON.stringify({ d: ['ok', 3, null, 'fine'] }),
        );

        expect(parsed?.queryB.dimensions).toEqual(['ok', 'fine']);
    });

    it('rejects a join type it does not recognise', () => {
        expect(
            parseMergeState(JSON.stringify({ j: 'sideways' }))?.joinType,
        ).toBe(MergeJoinType.FULL);
    });

    it('keeps composite key parts and drops malformed ones', () => {
        const parsed = parseMergeState(
            JSON.stringify({ k: [['a', 'b'], 'nope', [1, 'c']] }),
        );

        expect(parsed?.joinParts).toEqual([
            { fieldA: 'a', fieldB: 'b' },
            { fieldA: null, fieldB: 'c' },
        ]);
    });
});
