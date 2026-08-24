// Role badge tests. Twin: lightdash-university test/academy-board-badges.test.ts.
// A change here lands in both repositories in the same piece of work.

import { describe, expect, it } from 'vitest';
import { roleBadge, type Rung } from './badges';
import { entry } from './testFixtures';

const held = [entry({ id: 'a' }), entry({ id: 'b' }), entry({ id: 'c' })];
const tiers = (pairs: [string, Rung][]): Map<string, Rung> => new Map(pairs);

describe('roleBadge', () => {
    it('sits at the lowest rung across the held modules', () => {
        expect(
            roleBadge(
                held,
                tiers([
                    ['a', 'gold'],
                    ['b', 'gold'],
                    ['c', 'gold'],
                ]),
            ),
        ).toMatchObject({ rung: 'gold', nextRung: 'violet' });
        expect(
            roleBadge(
                held,
                tiers([
                    ['a', 'violet'],
                    ['b', 'gold'],
                    ['c', 'silver'],
                ]),
            ),
        ).toMatchObject({ rung: 'silver', nextRung: 'gold' });
    });

    it('a module with no row pins the badge to locked', () => {
        expect(
            roleBadge(
                held,
                tiers([
                    ['a', 'violet'],
                    ['b', 'violet'],
                ]),
            ),
        ).toMatchObject({ rung: 'locked', nextRung: 'bronze' });
    });

    it('counts how many held modules already cleared the next rung', () => {
        expect(
            roleBadge(
                held,
                tiers([
                    ['a', 'gold'],
                    ['b', 'bronze'],
                ]),
            ),
        ).toEqual({
            rung: 'locked',
            nextRung: 'bronze',
            at: 2,
            of: 3,
        });
        expect(
            roleBadge(
                held,
                tiers([
                    ['a', 'gold'],
                    ['b', 'silver'],
                    ['c', 'silver'],
                ]),
            ),
        ).toEqual({ rung: 'silver', nextRung: 'gold', at: 1, of: 3 });
    });

    it('tops out with no next rung once everything is violet', () => {
        expect(
            roleBadge(
                held,
                tiers([
                    ['a', 'violet'],
                    ['b', 'violet'],
                    ['c', 'violet'],
                ]),
            ),
        ).toEqual({ rung: 'violet', nextRung: null, at: 3, of: 3 });
    });

    it('a role holding nothing is locked with nothing to count', () => {
        expect(roleBadge([], new Map())).toEqual({
            rung: 'locked',
            nextRung: 'bronze',
            at: 0,
            of: 0,
        });
    });

    it('ignores tiers for modules the role does not hold', () => {
        expect(
            roleBadge(
                [entry({ id: 'a' })],
                tiers([
                    ['a', 'bronze'],
                    ['elsewhere', 'locked'],
                ]),
            ),
        ).toMatchObject({ rung: 'bronze', of: 1 });
    });
});
