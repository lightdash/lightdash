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

    it('reads "any value" with neither a value nor a default', () => {
        expect(getParameterDisplayValue({ label: 'P' }, null)).toBe(
            'any value',
        );
    });
});
