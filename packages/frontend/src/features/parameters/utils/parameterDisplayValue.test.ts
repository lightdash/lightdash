import { formatDate, parseDate, TimeFrames } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getParameterDisplayValue } from './parameterDisplayValue';

const shownDate = (iso: string) =>
    formatDate(parseDate(iso, TimeFrames.DAY), TimeFrames.DAY, false);

describe('getParameterDisplayValue', () => {
    it('shows a string, a number and a joined list as they are', () => {
        expect(
            getParameterDisplayValue({ label: 'P', type: 'string' }, 'EMEA'),
        ).toBe('EMEA');
        expect(
            getParameterDisplayValue({ label: 'P', type: 'number' }, 5),
        ).toBe('5');
        expect(getParameterDisplayValue({ label: 'P' }, ['a', 'b'])).toBe(
            'a, b',
        );
    });

    it('formats a date value as a day', () => {
        expect(
            getParameterDisplayValue(
                { label: 'P', type: 'date' },
                '2026-10-01',
            ),
        ).toBe(shownDate('2026-10-01'));
    });

    it('shows the default when unset, a date one formatted and a list joined', () => {
        expect(
            getParameterDisplayValue({ label: 'P', default: 'Global' }, null),
        ).toBe('Global');
        expect(
            getParameterDisplayValue({ label: 'P', default: ['a', 'b'] }, ''),
        ).toBe('a, b');
        expect(
            getParameterDisplayValue(
                { label: 'P', type: 'date', default: '2026-01-02' },
                null,
            ),
        ).toBe(shownDate('2026-01-02'));
    });

    it('shows option labels for the value and the default, single and multi', () => {
        const options = [
            { label: 'Last 12 months', value: 'last_12m' },
            { label: 'Last 30 days', value: 'last_30d' },
        ];
        expect(
            getParameterDisplayValue({ label: 'P', options }, 'last_12m'),
        ).toBe('Last 12 months');
        expect(
            getParameterDisplayValue({ label: 'P', options }, [
                'last_12m',
                'last_30d',
            ]),
        ).toBe('Last 12 months, Last 30 days');
        expect(
            getParameterDisplayValue(
                { label: 'P', options, default: 'last_30d' },
                null,
            ),
        ).toBe('Last 30 days');
        expect(
            getParameterDisplayValue(
                { label: 'P', options, default: ['last_30d', 'last_12m'] },
                null,
            ),
        ).toBe('Last 30 days, Last 12 months');
    });

    it('matches a numeric option and falls back to the raw value without a match', () => {
        expect(
            getParameterDisplayValue(
                {
                    label: 'P',
                    type: 'number',
                    options: [{ label: 'Ten', value: 10 }],
                },
                10,
            ),
        ).toBe('Ten');
        expect(
            getParameterDisplayValue(
                { label: 'P', options: [{ label: 'A', value: 'a' }] },
                ['a', 'custom'],
            ),
        ).toBe('A, custom');
    });

    it('reads "any value" with neither a value nor a default', () => {
        expect(getParameterDisplayValue({ label: 'P' }, null)).toBe(
            'any value',
        );
    });
});
