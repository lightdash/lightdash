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

    it('formats upcoming hourly runs with the schedule timezone', () => {
        const runs = getNextRuns('22 * * * *', 'UTC', 2);

        expect(runs.map((run) => run.label)).toEqual([
            'Wed, Sep 9 · 9:22 AM UTC',
            'Wed, Sep 9 · 10:22 AM UTC',
        ]);
        expect(runs[0]?.timeZoneName).toBe('UTC');
    });

    it('labels runs in a non-UTC schedule timezone', () => {
        const [run] = getNextRuns('22 * * * *', 'Europe/London', 1);

        expect(run?.label).toMatch(/^Wed, Sep 9 · 10:22 AM /);
        expect(run?.label).not.toMatch(/UTC$/);
        expect(run?.timeZoneName).toBeTruthy();
        expect(run?.timeZoneName).not.toBe('UTC');
    });
});
