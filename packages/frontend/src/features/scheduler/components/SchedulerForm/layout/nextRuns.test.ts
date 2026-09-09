import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getNextRuns } from './nextRuns';

describe('getNextRuns', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-09T09:20:00.000Z'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns no runs without a cron expression', () => {
        expect(getNextRuns('', 'UTC')).toEqual([]);
    });

    it('formats upcoming hourly runs in the schedule timezone', () => {
        const runs = getNextRuns('22 * * * *', 'UTC', 2);

        expect(runs.map((run) => run.label)).toEqual([
            'Wed, Sep 9 · 9:22 AM',
            'Wed, Sep 9 · 10:22 AM',
        ]);
        expect(runs[0]?.timeZoneName).toBe('UTC');
    });

    it('formats the same instants in the viewer timezone', () => {
        const runs = getNextRuns('22 * * * *', 'UTC', 2, 'Europe/London');

        expect(runs.map((run) => run.label)).toEqual([
            'Wed, Sep 9 · 10:22 AM',
            'Wed, Sep 9 · 11:22 AM',
        ]);
        expect(runs[0]?.timeZoneName).not.toBe('UTC');
        expect(runs[0]?.timeZoneName).toBeTruthy();
    });
});
