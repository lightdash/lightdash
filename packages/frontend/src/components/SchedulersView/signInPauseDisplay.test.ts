import { SchedulerFormat } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    canSendMissedRun,
    matchesSignInPauseFilter,
} from './signInPauseDisplay';

describe('sign-in pause display', () => {
    it('shows paused and personal filters from server state', () => {
        const scheduler = {
            pausedReason: 'sign_in_expired' as const,
            runsOnPersonalSignIn: true,
        };
        expect(matchesSignInPauseFilter(scheduler, 'paused')).toBe(true);
        expect(matchesSignInPauseFilter(scheduler, 'personal')).toBe(true);
        expect(
            matchesSignInPauseFilter(
                { pausedReason: null, runsOnPersonalSignIn: false },
                'paused',
            ),
        ).toBe(false);
    });

    it('offers a missed delivery only after resume', () => {
        const scheduler = {
            missedRunAt: new Date(),
            pausedReason: null,
            format: SchedulerFormat.PDF,
        };
        expect(canSendMissedRun(scheduler)).toBe(true);
        expect(
            canSendMissedRun({ ...scheduler, pausedReason: 'sign_in_expired' }),
        ).toBe(false);
        expect(
            canSendMissedRun({ ...scheduler, format: SchedulerFormat.GSHEETS }),
        ).toBe(false);
    });
});
