import { describe, expect, it } from 'vitest';
import { dropFutureDays, formatAllowance, formatCredits } from './creditUsage';

describe('formatCredits', () => {
    it('always shows two decimals so figures line up', () => {
        expect(formatCredits(260.3)).toMatch(/260[.,]30/);
        expect(formatCredits(12)).toMatch(/12[.,]00/);
    });
});

describe('formatAllowance', () => {
    it('shows a whole allowance without decimals', () => {
        expect(formatAllowance(90)).toBe('90');
        expect(formatAllowance(1500)).toMatch(/^1[,.\s]?500$/);
    });
});

describe('dropFutureDays', () => {
    it('keeps days up to and including today', () => {
        const days = ['2026-10-04', '2026-10-05', '2026-10-06'].map((date) => ({
            date,
        }));
        expect(
            dropFutureDays(days, new Date('2026-10-05T23:00:00Z')).map(
                (day) => day.date,
            ),
        ).toEqual(['2026-10-04', '2026-10-05']);
    });
});
