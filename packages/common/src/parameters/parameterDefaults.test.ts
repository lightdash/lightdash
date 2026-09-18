import { resolveParameterDefault } from './parameterDefaults';

describe('resolveParameterDefault', () => {
    const now = new Date(2026, 8, 17); // 17 Sep 2026, local time

    it('resolves the today sentinel on a date parameter to the current date', () => {
        expect(
            resolveParameterDefault(
                { label: 'Period to', type: 'date', default: 'today' },
                now,
            ),
        ).toBe('2026-09-17');
    });

    it('takes the date in the given timezone', () => {
        const instant = new Date('2026-09-17T23:30:00Z'); // 18 Sep 12:30 in Auckland
        const definition = {
            label: 'Period to',
            type: 'date' as const,
            default: 'today',
        };
        expect(
            resolveParameterDefault(definition, instant, 'Pacific/Auckland'),
        ).toBe('2026-09-18');
        expect(resolveParameterDefault(definition, instant, 'UTC')).toBe(
            '2026-09-17',
        );
        expect(
            resolveParameterDefault(definition, instant, 'America/Los_Angeles'),
        ).toBe('2026-09-17');
    });

    it('keeps a static ISO date default', () => {
        expect(
            resolveParameterDefault(
                { label: 'Period to', type: 'date', default: '2026-07-31' },
                now,
            ),
        ).toBe('2026-07-31');
    });

    it('keeps "today" as a literal on a string parameter', () => {
        expect(
            resolveParameterDefault(
                { label: 'Anchor', type: 'string', default: 'today' },
                now,
            ),
        ).toBe('today');
        expect(
            resolveParameterDefault({ label: 'Anchor', default: 'today' }, now),
        ).toBe('today');
    });

    it('returns undefined when there is no default', () => {
        expect(
            resolveParameterDefault({ label: 'Period to', type: 'date' }, now),
        ).toBeUndefined();
    });
});
