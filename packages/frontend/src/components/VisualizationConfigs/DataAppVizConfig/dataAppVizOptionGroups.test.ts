import { type DataAppVizConfigOption } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    groupDataAppVizOptions,
    UNGROUPED_OPTIONS_LABEL,
} from './dataAppVizOptionGroups';

const option = (name: string, group?: string): DataAppVizConfigOption => ({
    type: 'boolean',
    name,
    label: name,
    default: true,
    ...(group ? { group } : {}),
});

describe('groupDataAppVizOptions', () => {
    it('returns no groups for an empty declaration', () => {
        expect(groupDataAppVizOptions([], null)).toEqual([]);
    });

    it('keeps declaration order and merges repeated groups', () => {
        const groups = groupDataAppVizOptions(
            [option('a', 'Style'), option('b', 'Axes'), option('c', 'Style')],
            null,
        );

        expect(groups.map((g) => g.label)).toEqual(['Style', 'Axes']);
        expect(groups[0].options.map((o) => o.name)).toEqual(['a', 'c']);
        expect(groups[1].options.map((o) => o.name)).toEqual(['b']);
    });

    it('collapses every ungrouped option into a single Display group', () => {
        const groups = groupDataAppVizOptions(
            [option('a'), option('b', 'Style'), option('c')],
            null,
        );

        expect(groups.map((g) => g.label)).toEqual([
            UNGROUPED_OPTIONS_LABEL,
            'Style',
        ]);
        expect(groups[0].options.map((o) => o.name)).toEqual(['a', 'c']);
    });

    it('marks no group as holding the palette when none is declared', () => {
        const groups = groupDataAppVizOptions([option('a', 'Style')], null);

        expect(groups.every((g) => !g.hasPalette)).toBe(true);
    });

    it('places a declared palette in the group it names', () => {
        const groups = groupDataAppVizOptions(
            [option('a', 'Style'), option('b', 'Axes')],
            { group: 'Style' },
        );

        expect(groups.map((g) => g.label)).toEqual(['Style', 'Axes']);
        expect(groups.map((g) => g.hasPalette)).toEqual([true, false]);
    });

    it('puts an ungrouped palette in the Display group', () => {
        const groups = groupDataAppVizOptions([option('a')], {});

        expect(groups.map((g) => g.label)).toEqual([UNGROUPED_OPTIONS_LABEL]);
        expect(groups[0].hasPalette).toBe(true);
    });

    it('creates a group for a palette whose tab no option shares', () => {
        const groups = groupDataAppVizOptions([option('a', 'Style')], {
            group: 'Colours',
        });

        expect(groups.map((g) => g.label)).toEqual(['Style', 'Colours']);
        expect(groups[1].options).toEqual([]);
        expect(groups[1].hasPalette).toBe(true);
    });

    it('gives a viz that declares only a palette a single group', () => {
        const groups = groupDataAppVizOptions([], { group: 'Colours' });

        expect(groups.map((g) => g.label)).toEqual(['Colours']);
        expect(groups[0].hasPalette).toBe(true);
    });
});
