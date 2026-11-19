import {
    type CaptureEdit,
    type CaptureLayoutOp,
    type CaptureQuestion,
    type CaptureRoute,
    type CaptureRouteTile,
} from '@lightdash/common';

export type CaptureRoutePile = keyof CaptureRoute;

const ALL_PILES: CaptureRoutePile[] = ['layout', 'questions', 'edits'];

/** Positions and sizes may be this many grid cells away from the expected ones. */
const CELL_TOLERANCE = 1;

const near = (a: number, b: number): boolean =>
    Math.abs(a - b) <= CELL_TOLERANCE;

const layoutOpMatches = (
    expected: CaptureLayoutOp,
    actual: CaptureLayoutOp,
): boolean => {
    switch (expected.type) {
        case 'move':
            return (
                actual.type === 'move' &&
                actual.tileUuid === expected.tileUuid &&
                near(actual.x, expected.x) &&
                near(actual.y, expected.y)
            );
        case 'resize':
            return (
                actual.type === 'resize' &&
                actual.tileUuid === expected.tileUuid &&
                near(actual.w, expected.w) &&
                near(actual.h, expected.h)
            );
        case 'swap':
            // Swapping A with B is the same change as swapping B with A.
            return (
                actual.type === 'swap' &&
                ((actual.tileUuid === expected.tileUuid &&
                    actual.withTileUuid === expected.withTileUuid) ||
                    (actual.tileUuid === expected.withTileUuid &&
                        actual.withTileUuid === expected.tileUuid))
            );
        default:
            return false;
    }
};

type Namer = (tileUuid: string) => string;

const describeLayoutOp = (op: CaptureLayoutOp, name: Namer): string => {
    switch (op.type) {
        case 'move':
            return `move ${name(op.tileUuid)} to x=${op.x} y=${op.y}`;
        case 'resize':
            return `resize ${name(op.tileUuid)} to w=${op.w} h=${op.h}`;
        case 'swap':
            return `swap ${name(op.tileUuid)} with ${name(op.withTileUuid)}`;
        default:
            return JSON.stringify(op);
    }
};

const compareLayout = (
    expected: CaptureLayoutOp[],
    actual: CaptureLayoutOp[],
    name: Namer,
): string[] => {
    const unmatched = [...actual];
    const missing = expected.filter((op) => {
        const index = unmatched.findIndex((candidate) =>
            layoutOpMatches(op, candidate),
        );
        if (index === -1) return true;
        unmatched.splice(index, 1);
        return false;
    });
    return [
        ...missing.map((op) => `layout: missing ${describeLayoutOp(op, name)}`),
        ...unmatched.map(
            (op) => `layout: unexpected ${describeLayoutOp(op, name)}`,
        ),
    ];
};

const tileSetKey = (tileUuids: string[]): string =>
    Array.from(new Set(tileUuids)).sort().join(',');

const describeTileSet = (key: string, name: Namer): string =>
    key === '' ? 'no tiles' : key.split(',').map(name).join(' + ');

/** Questions and edits: same count, same tiles for each. Wording is ignored. */
const compareTexts = (
    pile: 'questions' | 'edits',
    expected: (CaptureQuestion | CaptureEdit)[],
    actual: (CaptureQuestion | CaptureEdit)[],
    name: Namer,
): string[] => {
    const unmatched = [...actual];
    const missing = expected.filter((item) => {
        const key = tileSetKey(item.tileUuids);
        const index = unmatched.findIndex(
            (candidate) => tileSetKey(candidate.tileUuids) === key,
        );
        if (index === -1) return true;
        unmatched.splice(index, 1);
        return false;
    });
    return [
        ...(expected.length === actual.length
            ? []
            : [`${pile}: expected ${expected.length}, got ${actual.length}`]),
        ...missing.map(
            (item) =>
                `${pile}: missing one about ${describeTileSet(tileSetKey(item.tileUuids), name)}`,
        ),
        ...unmatched.map(
            (item) =>
                `${pile}: unexpected one about ${describeTileSet(tileSetKey(item.tileUuids), name)}: "${item.text}"`,
        ),
    ];
};

/**
 * Compares what the sorter returned with what a fixture expects. Returns one
 * line per difference; an empty list means the route matches.
 *
 * - Layout operations match on type and tile ids, in any order, with move
 *   positions and resize sizes within one grid cell.
 * - Questions and edits match on count and on the set of tiles for each.
 *   Their wording is not compared.
 */
export const compareCaptureRoute = ({
    expected,
    actual,
    tiles = [],
    piles = ALL_PILES,
}: {
    expected: CaptureRoute;
    actual: CaptureRoute;
    /** Used to name tiles in the differences. */
    tiles?: CaptureRouteTile[];
    /** Which piles to compare. All three when left out. */
    piles?: CaptureRoutePile[];
}): string[] => {
    const titles = new Map(tiles.map((tile) => [tile.uuid, tile.title]));
    const name: Namer = (tileUuid) => {
        const title = titles.get(tileUuid);
        return title ? `"${title}"` : tileUuid;
    };
    return [
        ...(piles.includes('layout')
            ? compareLayout(expected.layout, actual.layout, name)
            : []),
        ...(piles.includes('questions')
            ? compareTexts(
                  'questions',
                  expected.questions,
                  actual.questions,
                  name,
              )
            : []),
        ...(piles.includes('edits')
            ? compareTexts('edits', expected.edits, actual.edits, name)
            : []),
    ];
};
