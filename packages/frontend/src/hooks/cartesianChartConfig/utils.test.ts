import { describe, expect, it } from 'vitest';
import { moveSeriesGroup, type SeriesGroup } from './utils';

const group = (name: string): SeriesGroup =>
    ({ index: 0, value: [{ name }] }) as unknown as SeriesGroup;

const names = (groups: SeriesGroup[]) => groups.map((g) => g.value[0].name);

describe('moveSeriesGroup', () => {
    const groups = [group('a'), group('b'), group('c')];

    it('moves a group forward in the list', () => {
        expect(names(moveSeriesGroup(groups, 0, 2))).toEqual(['b', 'c', 'a']);
    });

    it('moves a group backward in the list', () => {
        expect(names(moveSeriesGroup(groups, 2, 0))).toEqual(['c', 'a', 'b']);
    });

    it('does not mutate the input', () => {
        moveSeriesGroup(groups, 0, 2);
        expect(names(groups)).toEqual(['a', 'b', 'c']);
    });

    it('returns the same list when the group does not move', () => {
        expect(moveSeriesGroup(groups, 1, 1)).toBe(groups);
    });

    it('returns the same list for an out-of-range source', () => {
        expect(moveSeriesGroup(groups, 5, 0)).toBe(groups);
    });
});
