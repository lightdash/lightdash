import {
    compactContentSearchText,
    getContentSearchPatterns,
} from './ContentSearchUtils';

describe('ContentSearchUtils', () => {
    it('compacts punctuation for fuzzy content name search', () => {
        expect(compactContentSearchText("What's new?")).toBe('whatsnew');
        expect(getContentSearchPatterns("What's")).toEqual({
            lower: "%what's%",
            compact: 'whats',
        });
    });
});
