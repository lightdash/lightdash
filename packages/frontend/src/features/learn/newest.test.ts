import { describe, expect, it, vi } from 'vitest';
import {
    buildLearnCatalogue,
    isNewRelease,
    newestFor,
    releasedOn,
    type LearnModule,
} from './catalogue';

// Release days are generated from git (scripts/scope-tours/released.ts);
// the tests fix them so the ordering rules are what is under test.
const released = vi.hoisted(() => ({ days: {} as Record<string, string> }));
vi.mock('../scopeTours/released', () => ({
    get TOUR_RELEASED() {
        return released.days;
    },
}));

const walkthroughs = buildLearnCatalogue().filter(
    (module) => module.available && module.kind !== 'docs',
);
const [first, second, third, fourth] = walkthroughs;
const heldFor = (...modules: LearnModule[]) =>
    new Set(modules.map((module) => module.scope));

describe('newest Learn modules', () => {
    it('orders by release day, newest first, then by teaching order', () => {
        released.days = {
            [first.scope]: '2026-09-07',
            [second.scope]: '2026-10-07',
            [third.scope]: '2026-10-07',
            [fourth.scope]: '2026-09-28',
        };
        const held = heldFor(first, second, third, fourth);
        expect(
            newestFor(held, walkthroughs).map((module) => module.scope),
        ).toEqual([second.scope, third.scope, fourth.scope]);
        expect(newestFor(held, walkthroughs, 1)).toEqual([second]);
    });

    it('leaves out modules the learner does not hold', () => {
        released.days = {
            [first.scope]: '2026-09-07',
            [second.scope]: '2026-10-07',
        };
        expect(newestFor(heldFor(first), walkthroughs)).toEqual([first]);
    });

    it('is empty when the learner holds none of them', () => {
        released.days = { [first.scope]: '2026-10-07' };
        expect(newestFor(new Set(), walkthroughs)).toEqual([]);
    });

    it('takes a lesson covering several scopes from its first release', () => {
        const lesson: LearnModule = {
            ...first,
            scopes: [first.scope, 'view:Covered'],
        };
        released.days = {
            [first.scope]: '2026-10-07',
            'view:Covered': '2026-09-10',
        };
        expect(releasedOn(lesson)).toBe('2026-09-10');
    });

    it('marks a module new within 30 days of the latest release in the build', () => {
        released.days = {
            [first.scope]: '2026-08-01',
            [second.scope]: '2026-09-20',
            [third.scope]: '2026-10-07',
        };
        expect(isNewRelease(third, walkthroughs)).toBe(true);
        expect(isNewRelease(second, walkthroughs)).toBe(true);
        expect(isNewRelease(first, walkthroughs)).toBe(false);
    });
});
