import { assertUnreachable, type AdoptionMetrics } from '@lightdash/common';
import { type ColourTransition } from '../map/colourTransition';
import { type ColourBy, type DotKind } from '../map/geometry';
import { LEGEND_KINDS } from '../map/mapStyles';

// A person on Lightdash, as each colouring draws them
export type WafflePerson = { id: string; kinds: Record<ColourBy, DotKind> };

export type WaffleSquare = {
    // The person's id, or for the people without an account their place among them
    key: string;
    kind: DotKind;
    // The square's place in its part in legend order, reading left to right and then down
    position: number;
};

const ROLE_KINDS: DotKind[] = [
    'admin',
    'editor',
    'interactiveViewer',
    'viewer',
];

const clamp = (value: number, min: number, max: number): number =>
    Math.min(Math.max(value, min), max);

// One role per person, each role spread as evenly as its count allows: every person takes the role furthest behind
// its share of the people so far, so the counts come out exact
const spreadRoles = (counts: number[], total: number): DotKind[] => {
    const placed = counts.map(() => 0);
    return Array.from({ length: total }, (_, index) => {
        // Behind by count × (index + 1) / total − placed, scaled by total to stay in whole numbers
        let role = 0;
        let behind = Number.NEGATIVE_INFINITY;
        counts.forEach((count, candidate) => {
            const gap = count * (index + 1) - placed[candidate] * total;
            if (gap > behind) {
                role = candidate;
                behind = gap;
            }
        });
        placed[role] += 1;
        return ROLE_KINDS[role];
    });
};

// A part's people on Lightdash from its counts, which say how many are in each bucket and role but not who: healthy,
// at risk then lost in order, with roles spread through them. Ids are places, so the same counts give the same people
export const getPartPeople = (
    partId: string,
    metrics: AdoptionMetrics,
): WafflePerson[] => {
    const total = Math.max(metrics.memberCount, 0);
    const healthy = clamp(metrics.activitySplit.healthy, 0, total);
    const atRisk = clamp(metrics.activitySplit.atRisk, 0, total - healthy);
    const { admins, editors, interactiveViewers, viewers } = metrics.roleSplit;
    const roles = spreadRoles(
        [admins, editors, interactiveViewers, viewers].map((count) =>
            Math.max(count, 0),
        ),
        total,
    );
    return roles.map((role, index) => ({
        id: `${partId}:${index}`,
        kinds: {
            activity:
                index < healthy
                    ? 'healthy'
                    : index < healthy + atRisk
                      ? 'atRisk'
                      : 'lost',
            role,
        },
    }));
};

// Each person once, placed in legend order for the colouring, then a grey square per person in the headcount without
// an account. Squares come back in the people's own order, which no colouring changes
export const groupSquares = (
    people: WafflePerson[],
    colourBy: ColourBy,
    headcount: number,
): WaffleSquare[] => {
    const seen = new Set<string>();
    const unique = people.filter((person) => {
        if (seen.has(person.id)) return false;
        seen.add(person.id);
        return true;
    });
    const order = LEGEND_KINDS[colourBy];
    const indexes = unique.map((_, index) => index);
    const kindOf = (index: number): DotKind => unique[index].kinds[colourBy];
    const grouped = [
        ...order.flatMap((kind) =>
            indexes.filter((index) => kindOf(index) === kind),
        ),
        // Never expected: a kind the legend does not show still gets its square
        ...indexes.filter((index) => !order.includes(kindOf(index))),
    ];
    const positions: number[] = [];
    grouped.forEach((index, position) => {
        positions[index] = position;
    });
    const withoutAccount = Math.max(headcount - unique.length, 0);
    return [
        ...unique.map(
            (person, index): WaffleSquare => ({
                key: person.id,
                kind: kindOf(index),
                position: positions[index],
            }),
        ),
        ...Array.from(
            { length: withoutAccount },
            (_, index): WaffleSquare => ({
                key: `none:${index}`,
                kind: 'noAccount',
                position: unique.length + index,
            }),
        ),
    ];
};

// Reflow glides every person's square at once, which stalls the page with more squares than this in view
export const REFLOW_SQUARE_LIMIT = 2000;

// The transition a change of colouring uses: the constant's, but a sweep where a reflow would move too many squares
export const chooseTransition = (
    preferred: ColourTransition,
    squareCount: number,
): ColourTransition =>
    preferred === 'reflow' && squareCount > REFLOW_SQUARE_LIMIT
        ? 'sweep'
        : preferred;

// The order a part's squares are drawn in, with each element's key. A reflow keeps each person's element and moves
// it; otherwise each place keeps its element and only its colour changes
export const getDrawnSquares = (
    squares: WaffleSquare[],
    transition: ColourTransition,
): { key: string; square: WaffleSquare }[] => {
    switch (transition) {
        case 'reflow':
            return squares.map((square) => ({ key: square.key, square }));
        case 'sweep':
            return [...squares]
                .sort((a, b) => a.position - b.position)
                .map((square) => ({ key: `place:${square.position}`, square }));
        default:
            return assertUnreachable(transition, 'Unknown colour transition');
    }
};
