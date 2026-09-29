import { isAiUsageBillable } from './billable';
import {
    getCalendarMonthPeriod,
    isAiCreditHoldReason,
    isWithinPeriod,
} from './types';

describe('getCalendarMonthPeriod', () => {
    test('buckets a call into its UTC month, half-open at the next month', () => {
        const period = getCalendarMonthPeriod(new Date('2026-09-29T23:59:59Z'));
        expect(period.periodStart.toISOString()).toBe(
            '2026-09-01T00:00:00.000Z',
        );
        expect(period.periodEnd.toISOString()).toBe('2026-10-01T00:00:00.000Z');
        expect(isWithinPeriod(new Date('2026-09-29T23:59:59Z'), period)).toBe(
            true,
        );
        expect(isWithinPeriod(period.periodEnd, period)).toBe(false);
    });

    test('rolls over the year in December', () => {
        const period = getCalendarMonthPeriod(new Date('2026-12-15T12:00:00Z'));
        expect(period.periodEnd.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    });
});

describe('isAiUsageBillable', () => {
    test('charges only completed calls on a managed key for billable features', () => {
        expect(
            isAiUsageBillable({
                feature: 'agent',
                keyOrigin: 'lightdash-managed',
                outcome: 'complete',
            }),
        ).toBe(true);
        expect(
            isAiUsageBillable({
                feature: 'agent',
                keyOrigin: 'self-managed',
                outcome: 'complete',
            }),
        ).toBe(false);
        expect(
            isAiUsageBillable({
                feature: 'data-app',
                keyOrigin: 'lightdash-managed',
                outcome: 'failed',
            }),
        ).toBe(false);
        expect(
            isAiUsageBillable({
                feature: 'review-classifier',
                keyOrigin: 'lightdash-managed',
                outcome: 'complete',
            }),
        ).toBe(false);
        expect(
            isAiUsageBillable({
                feature: 'agent',
                keyOrigin: null,
                outcome: 'complete',
            }),
        ).toBe(false);
    });
});

describe('isAiCreditHoldReason', () => {
    test('accepts only the fixed reasons', () => {
        expect(isAiCreditHoldReason('manual_pause')).toBe(true);
        expect(isAiCreditHoldReason('because')).toBe(false);
    });
});
