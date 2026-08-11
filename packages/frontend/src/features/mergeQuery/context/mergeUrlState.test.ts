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
    postPivotIndex: 1,
    joinType: MergeJoinType.LEFT,
    pivotValues: { a: ['completed', 'shipped'], b: ['pro'] },
};

describe('merge url state', () => {
    it('round-trips the whole relationship', () => {
        expect(parseMergeState(serializeMergeState(state))).toEqual(state);
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
            pivotValues: { a: [], b: [] },
            postPivotIndex: null,
        });
    });

    it('drops non-string entries rather than carrying them into a query', () => {
        const parsed = parseMergeState(
            JSON.stringify({ d: ['ok', 3, null, 'fine'], p: 'not-an-array' }),
        );

        expect(parsed?.queryB.dimensions).toEqual(['ok', 'fine']);
        expect(parsed?.pivotValues).toEqual({ a: [], b: [] });
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

    it('ignores a post-pivot index that is not a whole number', () => {
        expect(
            parseMergeState(JSON.stringify({ x: 1.5 }))?.postPivotIndex,
        ).toBeNull();
    });
});
