import { describe, expect, it } from 'vitest';
import { formatDurationMs, getResponseTimingMetrics } from './responseTiming';

describe('getResponseTimingMetrics', () => {
    it('derives first-token and total durations from the timestamps', () => {
        expect(
            getResponseTimingMetrics({
                startedAt: '2026-09-03T10:00:00.000Z',
                firstTokenAt: '2026-09-03T10:00:01.250Z',
                finishedAt: '2026-09-03T10:00:12.000Z',
            }),
        ).toEqual({ ttftMs: 1250, totalMs: 12000 });
    });

    it('returns a null first-token figure when nothing streamed', () => {
        expect(
            getResponseTimingMetrics({
                startedAt: '2026-09-03T10:00:00.000Z',
                firstTokenAt: null,
                finishedAt: '2026-09-03T10:00:03.000Z',
            }),
        ).toEqual({ ttftMs: null, totalMs: 3000 });
    });

    it('rejects unparseable timestamps instead of producing NaN', () => {
        expect(
            getResponseTimingMetrics({
                startedAt: 'not a date',
                firstTokenAt: null,
                finishedAt: '2026-09-03T10:00:03.000Z',
            }),
        ).toBeNull();
    });
});

describe('formatDurationMs', () => {
    it.each([
        [0, '0ms'],
        [850, '850ms'],
        [1250, '1.3s'],
        [59_940, '59.9s'],
        [61_000, '1m 1s'],
        [125_500, '2m 6s'],
    ])('formats %d ms as %s', (ms, expected) => {
        expect(formatDurationMs(ms)).toBe(expected);
    });
});
