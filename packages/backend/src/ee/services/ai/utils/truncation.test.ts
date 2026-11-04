import { truncate, truncateMiddle } from './truncation';

describe('truncate', () => {
    it('keeps the requested number of characters before the suffix', () => {
        expect(truncate('abcdefghijklmnopq', 3)).toEqual('abc...(truncated)');
    });

    it('uses unicode characters for the limit', () => {
        expect(truncate('売上高前年差', 3)).toEqual('売上高...(truncated)');
    });

    it('handles invalid max lengths safely', () => {
        expect(truncate('abc', 0)).toEqual('');
        expect(truncate('abc', -1)).toEqual('');
        expect(truncate('abc', Number.NaN)).toEqual('');
    });
});

describe('truncateMiddle', () => {
    it('returns short values unchanged', () => {
        expect(truncateMiddle('short', 10)).toEqual('short');
    });

    it('keeps the head and the tail within the limit', () => {
        const traceback = `Traceback:\n${'  frame\n'.repeat(1000)}KeyError: 'amount'`;
        const truncated = truncateMiddle(traceback, 200);
        expect(truncated.length).toBeLessThanOrEqual(200);
        expect(truncated.startsWith('Traceback:')).toBe(true);
        expect(truncated.endsWith("KeyError: 'amount'")).toBe(true);
        expect(truncated).toContain('...(truncated)...');
    });
});
