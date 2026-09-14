import { describe, expect, it } from 'vitest';
import { findLabelQuery } from './findFieldSuggestionMatch';

const LABELS = [
    'Revenue',
    'Unique Customers',
    'Count distinct of Order id',
    'Revenue (net)',
];

const match = (text: string, labels: string[] = LABELS) => {
    const cursor = text.indexOf('|');
    if (cursor === -1) throw new Error('test text must mark the cursor with |');
    return findLabelQuery({
        text: text.replace('|', ''),
        cursor,
        char: '@',
        allowedPrefixes: null,
        startOfLine: false,
        labels,
    });
};

describe('findLabelQuery', () => {
    it('matches an empty query right after the trigger', () => {
        expect(match('=@|')).toEqual({ from: 1, to: 2, query: '' });
    });

    it('matches a single-word label', () => {
        expect(match('=@Reven|')).toEqual({ from: 1, to: 7, query: 'Reven' });
    });

    it('keeps matching across the spaces of a multi-word label', () => {
        expect(match('=@Unique |')).toEqual({
            from: 1,
            to: 9,
            query: 'Unique ',
        });
        expect(match('=@Unique Cust|')).toEqual({
            from: 1,
            to: 13,
            query: 'Unique Cust',
        });
    });

    it('matches a label typed in full', () => {
        expect(match('=@Unique Customers|')).toEqual({
            from: 1,
            to: 18,
            query: 'Unique Customers',
        });
    });

    it('matches a generated custom metric label', () => {
        expect(match('=@Count distinct of Order|')).toEqual({
            from: 1,
            to: 25,
            query: 'Count distinct of Order',
        });
    });

    it('covers the rest of the label when the cursor sits inside the query', () => {
        expect(match('=@Unique| Customers')).toEqual({
            from: 1,
            to: 18,
            query: 'Unique Customers',
        });
    });

    it('stops the query before text that follows the mention', () => {
        expect(match('=RUNNING_TOTAL(@Unique Customers|)')).toEqual({
            from: 15,
            to: 32,
            query: 'Unique Customers',
        });
    });

    it('does not swallow a closing paren while the cursor is mid-label', () => {
        expect(match('=RUNNING_TOTAL(@Uni|que Customers)')).toEqual({
            from: 15,
            to: 32,
            query: 'Unique Customers',
        });
    });

    it('keeps a paren that belongs to the label and drops the one that does not', () => {
        expect(match('=SUM(@Revenue (net|))')).toEqual({
            from: 5,
            to: 19,
            query: 'Revenue (net)',
        });
    });

    it('does not reach past the trigger into text the user has not typed', () => {
        expect(match('=RUNNING_TOTAL(@|)')).toEqual({
            from: 15,
            to: 16,
            query: '',
        });
    });

    it('reaches forward from an empty query when a label follows the trigger', () => {
        expect(match('=@|Unique Customers')).toEqual({
            from: 1,
            to: 18,
            query: 'Unique Customers',
        });
    });

    it('stops at an operator between two field references', () => {
        expect(match('=@Revenue| + @Unique Customers')).toEqual({
            from: 1,
            to: 9,
            query: 'Revenue',
        });
    });

    it('matches a word that resembles no label so the picker reports no fields', () => {
        expect(match('=@zzz|')).toEqual({ from: 1, to: 5, query: 'zzz' });
    });

    it('stops matching once the text stops resembling any label', () => {
        expect(match('=@zzz yyy|')).toBeNull();
    });

    it('falls back to a single word when there are no fields to offer', () => {
        expect(match('=@Reven|', [])).toEqual({
            from: 1,
            to: 7,
            query: 'Reven',
        });
        expect(match('=@Unique Cust|', [])).toBeNull();
    });

    it('ignores a trigger that is not before the cursor', () => {
        expect(match('=|@Revenue')).toBeNull();
        expect(match('|')).toBeNull();
    });

    it('stops at a mention node already in the formula', () => {
        expect(match('=@Revenue\0 + Unique|')).toBeNull();
    });

    it('honours allowedPrefixes', () => {
        const withPrefixes = (text: string) => {
            const cursor = text.indexOf('|');
            return findLabelQuery({
                text: text.replace('|', ''),
                cursor,
                char: '@',
                allowedPrefixes: [' '],
                startOfLine: false,
                labels: LABELS,
            });
        };
        expect(withPrefixes('sum of @Reven|')).toEqual({
            from: 7,
            to: 13,
            query: 'Reven',
        });
        expect(withPrefixes('sum(@Reven|')).toBeNull();
    });
});
