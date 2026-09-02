import { describe, expect, it } from 'vitest';
import { type RoleBadge } from './badges';
import { badgeDetail } from './badgesView';

const badge = (overrides: Partial<RoleBadge>): RoleBadge => ({
    rung: 'bronze',
    nextRung: 'silver',
    at: 1,
    of: 3,
    ...overrides,
});

describe('badgeDetail', () => {
    it('names what earns the next rung and how far along the role is', () => {
        expect(badgeDetail(badge({}), true)).toBe(
            'Pass every quiz for silver · 1 of 3 there',
        );
    });

    it('says the role topped out, in the singular for one module', () => {
        expect(
            badgeDetail(
                badge({ rung: 'violet', nextRung: null, at: 1, of: 1 }),
                true,
            ),
        ).toBe('All 1 module at violet');
        expect(
            badgeDetail(
                badge({ rung: 'violet', nextRung: null, at: 4, of: 4 }),
                true,
            ),
        ).toBe('All 4 modules at violet');
    });

    it('says it cannot tell rather than Locked when badges did not load', () => {
        expect(badgeDetail(badge({ rung: 'locked' }), false)).toBe(
            'Badges unavailable right now',
        );
    });
});
