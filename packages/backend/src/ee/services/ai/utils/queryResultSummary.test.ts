import { describe, expect, it } from 'vitest';
import {
    getContextTruncationNote,
    getExecutionStatsNote,
    getQueryResultSummary,
} from './queryResultSummary';

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

describe('getContextTruncationNote', () => {
    it('says nothing when every returned row is in context', () => {
        expect(
            getContextTruncationNote({ rowCount: 50, maxContextRows: 50 }),
        ).toBe('');
    });

    it('distinguishes the context slice from the query result', () => {
        const note = getContextTruncationNote({
            rowCount: 4_000,
            maxContextRows: 50,
        });

        expect(note).toContain('first 50 of those 4000 rows');
        // The agent must not read the slice as the query having stopped early.
        expect(note).toContain('the query returned all of them');
        expect(note).toContain('retained server-side');
        expect(note).toContain('query an aggregate');
    });
});

describe('getExecutionStatsNote', () => {
    it('states every reported statistic with exact bytes', () => {
        expect(
            getExecutionStatsNote({
                jobId: 'job-123',
                bytesProcessed: 1048576,
                bytesBilled: 10485760,
                executionTimeMs: 1250,
                cacheHit: false,
            }),
        ).toBe(
            " Warehouse execution stats: 1048576 bytes (1.0 MiB) processed, 10485760 bytes (10.0 MiB) billed, ran for 1250 ms, served from the warehouse's own result cache: no, warehouse job ID job-123.",
        );
    });

    it('omits statistics the warehouse did not report', () => {
        expect(
            getExecutionStatsNote({
                jobId: null,
                bytesProcessed: 512,
                bytesBilled: null,
                executionTimeMs: null,
                cacheHit: true,
            }),
        ).toBe(
            " Warehouse execution stats: 512 bytes processed, served from the warehouse's own result cache: yes.",
        );
    });

    it('is empty without stats', () => {
        expect(getExecutionStatsNote(null)).toBe('');
        expect(
            getExecutionStatsNote({
                jobId: null,
                bytesProcessed: null,
                bytesBilled: null,
                executionTimeMs: null,
                cacheHit: null,
            }),
        ).toBe('');
    });
});
