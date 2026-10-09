import { describe, expect, it } from 'vitest';
import { type ColourBy, type DotKind } from '../map/geometry';
import { LEGEND_KINDS } from '../map/mapStyles';
import { metricsFixture } from '../utils/adoptionFixtures';
import {
    chooseTransition,
    getPartPeople,
    groupSquares,
    REFLOW_SQUARE_LIMIT,
    type WafflePerson,
    type WaffleSquare,
} from './groupSquares';

// Ten people: 4 healthy, 2 at risk and 4 lost; 1 admin, 3 editors, 2 interactive viewers, 4 viewers
const metrics = metricsFixture(10, null, {
    activeCount30d: 4,
    activitySplit: { healthy: 4, atRisk: 2, lost: 4 },
    roleSplit: { admins: 1, editors: 3, interactiveViewers: 2, viewers: 4 },
});

const countKinds = (kinds: DotKind[]) =>
    kinds.reduce<Record<string, number>>(
        (counts, kind) => ({ ...counts, [kind]: (counts[kind] ?? 0) + 1 }),
        {},
    );

// The kinds in the order they are drawn, reading left to right and then down
const inReadingOrder = (squares: WaffleSquare[]): DotKind[] =>
    [...squares]
        .sort((a, b) => a.position - b.position)
        .map((square) => square.kind);

const person = (id: string, activity: DotKind): WafflePerson => ({
    id,
    kinds: { activity, role: 'viewer' },
});

describe('getPartPeople', () => {
    const people = getPartPeople('sales', metrics);

    it('makes one person per account in the part, each with a stable id', () => {
        expect(people.map((p) => p.id)).toEqual(
            Array.from({ length: 10 }, (_, index) => `sales:${index}`),
        );
        expect(getPartPeople('sales', metrics)).toEqual(people);
    });

    it('gives each colouring exactly the counts in the summary', () => {
        expect(countKinds(people.map((p) => p.kinds.activity))).toEqual({
            healthy: 4,
            atRisk: 2,
            lost: 4,
        });
        expect(countKinds(people.map((p) => p.kinds.role))).toEqual({
            admin: 1,
            editor: 3,
            interactiveViewer: 2,
            viewer: 4,
        });
    });

    it('puts the activity buckets in order: healthy, then at risk, then lost', () => {
        expect(people.map((p) => p.kinds.activity)).toEqual([
            ...Array(4).fill('healthy'),
            ...Array(2).fill('atRisk'),
            ...Array(4).fill('lost'),
        ]);
    });

    it('spreads the roles through the people rather than giving the most active one role', () => {
        const even = getPartPeople(
            'even',
            metricsFixture(6, null, {
                activeCount30d: 2,
                roleSplit: {
                    admins: 3,
                    editors: 0,
                    interactiveViewers: 0,
                    viewers: 3,
                },
            }),
        );
        expect(even.map((p) => p.kinds.role)).toEqual([
            'admin',
            'viewer',
            'admin',
            'viewer',
            'admin',
            'viewer',
        ]);
    });

    it('makes nobody for a part with nobody on Lightdash', () => {
        expect(getPartPeople('empty', metricsFixture(0, null))).toEqual([]);
    });
});

describe('groupSquares', () => {
    const people = getPartPeople('sales', metrics);

    it.each(['activity', 'role'] as ColourBy[])(
        'groups the people in legend order when colouring by %s',
        (colourBy) => {
            const kinds = inReadingOrder(groupSquares(people, colourBy, 10));
            const ranks = kinds.map((kind) =>
                LEGEND_KINDS[colourBy].indexOf(kind),
            );
            expect(ranks.every((rank) => rank >= 0)).toBe(true);
            expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
        },
    );

    it('gives every square its own place', () => {
        const positions = groupSquares(people, 'role', 14).map(
            (square) => square.position,
        );
        expect([...positions].sort((a, b) => a - b)).toEqual(
            Array.from({ length: 14 }, (_, index) => index),
        );
    });

    it('adds a grey square after the people for everyone in the headcount without an account', () => {
        const squares = groupSquares(people, 'activity', 14);
        expect(squares).toHaveLength(14);
        expect(squares.slice(10)).toEqual([
            { key: 'none:0', kind: 'noAccount', position: 10 },
            { key: 'none:1', kind: 'noAccount', position: 11 },
            { key: 'none:2', kind: 'noAccount', position: 12 },
            { key: 'none:3', kind: 'noAccount', position: 13 },
        ]);
        expect(inReadingOrder(squares).slice(-4)).toEqual(
            Array(4).fill('noAccount'),
        );
    });

    it('draws every person even where the headcount is below them, with no grey squares', () => {
        expect(groupSquares(people, 'activity', 6)).toHaveLength(10);
    });

    it('draws a person listed twice once', () => {
        const squares = groupSquares(
            [
                person('ada', 'lost'),
                person('grace', 'healthy'),
                person('ada', 'lost'),
            ],
            'activity',
            4,
        );
        expect(squares).toEqual([
            { key: 'ada', kind: 'lost', position: 1 },
            { key: 'grace', kind: 'healthy', position: 0 },
            { key: 'none:0', kind: 'noAccount', position: 2 },
            { key: 'none:1', kind: 'noAccount', position: 3 },
        ]);
    });

    it("returns the squares in the people's own order whatever the colouring, so only their places change", () => {
        const byActivity = groupSquares(people, 'activity', 12);
        const byRole = groupSquares(people, 'role', 12);
        expect(byRole.map((square) => square.key)).toEqual(
            byActivity.map((square) => square.key),
        );
        expect(
            byRole.some(
                (square, index) =>
                    square.position !== byActivity[index].position,
            ),
        ).toBe(true);
    });
});

describe('chooseTransition', () => {
    it('reflows with up to 2,000 squares in view and sweeps above that', () => {
        expect(REFLOW_SQUARE_LIMIT).toBe(2000);
        expect(chooseTransition('reflow', 12)).toBe('reflow');
        expect(chooseTransition('reflow', 2000)).toBe('reflow');
        expect(chooseTransition('reflow', 2001)).toBe('sweep');
    });

    it('always sweeps when the constant says sweep', () => {
        expect(chooseTransition('sweep', 12)).toBe('sweep');
        expect(chooseTransition('sweep', 20000)).toBe('sweep');
    });
});
