import { describe, expect, it } from 'vitest';
import { getQueryResultSummary } from './queryResultSummary';

describe('getQueryResultSummary', () => {
    it('states nothing was truncated when the limit was not reached', () => {
        const summary = getQueryResultSummary({
            rowCount: 12,
            requestedLimit: null,
            effectiveLimit: 1000,
            maxLimit: 1000,
        });

        expect(summary).toContain('Returned all 12 rows');
        expect(summary).toContain('nothing was truncated');
    });

    it('attributes the limit to the tool call when the model chose it', () => {
        // The original bug: model picks 500, gets 500 rows, then reports it as
        // a system limit. The summary must make that attribution impossible.
        const summary = getQueryResultSummary({
            rowCount: 500,
            requestedLimit: 500,
            effectiveLimit: 500,
            maxLimit: 1000,
        });

        expect(summary).toContain('this tool call requested 500');
        expect(summary).toContain('not a system, display, or platform limit');
    });

    it('attributes the limit to the tool maximum when none was requested', () => {
        const summary = getQueryResultSummary({
            rowCount: 1000,
            requestedLimit: null,
            effectiveLimit: 1000,
            maxLimit: 1000,
        });

        expect(summary).toContain('requested no limit');
        expect(summary).toContain("this tool's maximum of 1000");
    });

    it('reports clamping when the request exceeded the maximum', () => {
        const summary = getQueryResultSummary({
            rowCount: 1000,
            requestedLimit: 5000,
            effectiveLimit: 1000,
            maxLimit: 1000,
        });

        expect(summary).toContain('requested 5000');
        expect(summary).toContain("capped to this tool's maximum of 1000");
    });

    it('flags that more rows may exist when the limit was reached', () => {
        const summary = getQueryResultSummary({
            rowCount: 250,
            requestedLimit: 250,
            effectiveLimit: 250,
            maxLimit: 1000,
        });

        expect(summary).toContain('more rows may exist');
    });
});
