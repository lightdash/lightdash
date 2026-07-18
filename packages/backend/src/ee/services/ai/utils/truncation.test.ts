import { truncate, truncateAtWordBoundary } from './truncation';

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

describe('truncateAtWordBoundary', () => {
    it('returns short strings unchanged', () => {
        const title = 'Revenue over last 12 months';
        expect(truncateAtWordBoundary(title, 60)).toBe(title);
    });

    it('truncates at a word boundary with ellipsis', () => {
        const title =
            'Monthly payment trends by partner for fiscal twenty twenty six';
        const truncated = truncateAtWordBoundary(title, 60);

        expect(truncated.length).toBeLessThanOrEqual(60);
        expect(truncated.endsWith('...')).toBe(true);
        expect(truncated).not.toContain(' twenty six');
    });
});
