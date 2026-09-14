import { describe, expect, it } from 'vitest';
import { isDeepResearchDraft } from './draftNudge';

describe('isDeepResearchDraft', () => {
    it('matches investigative drafts of at least 12 words', () => {
        expect(
            isDeepResearchDraft(
                'Why did our order volume drop over the past year across payment methods and cohorts',
            ),
        ).toBe(true);
        // Stem markers must match their inflections (regression: a trailing
        // word boundary once made "investigate"/"compare"/"decline" unmatchable).
        expect(isDeepResearchDraft('investigate '.repeat(12).trim())).toBe(
            true,
        );
        expect(
            isDeepResearchDraft(
                'Compare revenue trends across customer segments and payment methods and explain the decline please',
            ),
        ).toBe(true);
        expect(
            isDeepResearchDraft(
                'Please analyze customer behavior across all our segments and payment methods for the quarterly review',
            ),
        ).toBe(true);
    });

    it('rejects short drafts even with markers', () => {
        expect(isDeepResearchDraft('why did revenue drop?')).toBe(false);
    });

    it('rejects long drafts without investigative markers', () => {
        expect(
            isDeepResearchDraft(
                'show me all orders from last year broken down by month and by region please',
            ),
        ).toBe(false);
        // "drop" must not match inside "dropdown"
        expect(
            isDeepResearchDraft(
                'The dropdown menu on the settings page is broken for all of our users somehow today',
            ),
        ).toBe(false);
    });
});
