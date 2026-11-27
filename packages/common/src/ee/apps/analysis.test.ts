import {
    DATA_APP_ANALYSIS_DEFAULT_LIMITS,
    resolveDataAppAnalysisTextMaxChars,
} from './analysis';

describe('resolveDataAppAnalysisTextMaxChars', () => {
    const raised = { ...DATA_APP_ANALYSIS_DEFAULT_LIMITS, textMaxChars: 8000 };

    it('applies the configured cap on the organization key', () => {
        expect(resolveDataAppAnalysisTextMaxChars(raised, true)).toBe(8000);
    });

    it('keeps the default on a Lightdash-managed key', () => {
        expect(resolveDataAppAnalysisTextMaxChars(raised, false)).toBe(2000);
    });

    it('falls back to the default when nothing is stored', () => {
        const { textMaxChars, ...legacy } = DATA_APP_ANALYSIS_DEFAULT_LIMITS;
        expect(resolveDataAppAnalysisTextMaxChars(legacy, true)).toBe(2000);
        expect(resolveDataAppAnalysisTextMaxChars(null, true)).toBe(2000);
    });
});
