import { truncate } from './truncation';

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
