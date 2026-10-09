import dayjs from 'dayjs';
import 'dayjs/locale/fr';
import { describe, expect, it } from 'vitest';
import { formatAgentConnectionDate } from './formatAgentConnectionDate';

describe('formatAgentConnectionDate', () => {
    it.each([
        [new Date(2027, 0, 7), '7 Jan 2027'],
        [new Date(2026, 11, 31), '31 Dec 2026'],
    ])('formats %s as %s', (date, expected) => {
        expect(formatAgentConnectionDate(date)).toBe(expected);
    });

    it('keeps English month names when the global locale is not English', () => {
        dayjs.locale('fr');
        try {
            expect(formatAgentConnectionDate(new Date(2027, 1, 7))).toBe(
                '7 Feb 2027',
            );
        } finally {
            dayjs.locale('en');
        }
    });
});
