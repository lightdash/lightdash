import {
    type DataAppVizConfigOption,
    type DataAppVizField,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    CONDITIONAL_FORMATTING_LABEL,
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
        expect(groupDataAppVizOptions([], null, [], {}, null)).toEqual([]);
    });

    it('keeps declaration order and merges repeated groups', () => {
        const groups = groupDataAppVizOptions(
            [option('a', 'Style'), option('b', 'Axes'), option('c', 'Style')],
            null,
            [],
            {},
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
            [],
            {},
            null,
        );

        expect(groups.map((g) => g.label)).toEqual([
            UNGROUPED_OPTIONS_LABEL,
            'Style',
        ]);
        expect(groups[0].options.map((o) => o.name)).toEqual(['a', 'c']);
    });

    it('marks no group as holding the palette when none is declared', () => {
        const groups = groupDataAppVizOptions(
            [option('a', 'Style')],
            null,
            [],
            {},
            null,
        );

        expect(groups.every((g) => !g.hasPalette)).toBe(true);
    });

    it('places a declared palette in the group it names', () => {
        const groups = groupDataAppVizOptions(
            [option('a', 'Style'), option('b', 'Axes')],
            { group: 'Style' },
            [],
            {},
            null,
        );

        expect(groups.map((g) => g.label)).toEqual(['Style', 'Axes']);
        expect(groups.map((g) => g.hasPalette)).toEqual([true, false]);
    });

    it('puts an ungrouped palette in the Display group', () => {
        const groups = groupDataAppVizOptions([option('a')], {}, [], {}, null);

        expect(groups.map((g) => g.label)).toEqual([UNGROUPED_OPTIONS_LABEL]);
        expect(groups[0].hasPalette).toBe(true);
    });

    it('creates a group for a palette whose tab no option shares', () => {
        const groups = groupDataAppVizOptions(
            [option('a', 'Style')],
            { group: 'Colours' },
            [],
            {},
            null,
        );

        expect(groups.map((g) => g.label)).toEqual(['Style', 'Colours']);
        expect(groups[1].options).toEqual([]);
        expect(groups[1].hasPalette).toBe(true);
    });

    it('gives a viz that declares only a palette a single group', () => {
        const groups = groupDataAppVizOptions(
            [],
            { group: 'Colours' },
            [],
            {},
            null,
        );

        expect(groups.map((g) => g.label)).toEqual(['Colours']);
        expect(groups[0].hasPalette).toBe(true);
    });

    it('adds tabs for grouped per-field options and leaves ungrouped ones out', () => {
        const metrics: DataAppVizField = {
            name: 'metrics',
            label: 'Metrics',
            type: 'metric',
            required: true,
            configOptions: [option('color', 'Series'), option('label')],
        };
        const groups = groupDataAppVizOptions(
            [option('a', 'Style'), option('b', 'Series')],
            null,
            [metrics],
            { metrics: ['orders_revenue'] },
            null,
        );

        expect(groups.map((g) => [g.label, g.hasFieldOptions])).toEqual([
            ['Style', false],
            ['Series', true],
        ]);
    });

    it('adds no tab for per-field options whose input has no bound field', () => {
        const metrics: DataAppVizField = {
            name: 'metrics',
            label: 'Metrics',
            type: 'metric',
            required: true,
            configOptions: [option('color', 'Series')],
        };
        const unbound = groupDataAppVizOptions([], null, [metrics], {}, null);
        expect(unbound).toEqual([]);

        const cleared = groupDataAppVizOptions(
            [],
            null,
            [metrics],
            { metrics: [] },
            null,
        );
        expect(cleared).toEqual([]);
    });

    it('places conditional formatting in the group it names, or its own tab', () => {
        const grouped = groupDataAppVizOptions(
            [option('a', 'Style')],
            null,
            [],
            {},
            { group: 'Style' },
        );
        expect(grouped.map((g) => g.hasConditionalFormatting)).toEqual([true]);

        const ungrouped = groupDataAppVizOptions(
            [option('a')],
            null,
            [],
            {},
            {},
        );
        expect(ungrouped.map((g) => g.label)).toEqual([
            UNGROUPED_OPTIONS_LABEL,
            CONDITIONAL_FORMATTING_LABEL,
        ]);
        expect(ungrouped.map((g) => g.hasConditionalFormatting)).toEqual([
            false,
            true,
        ]);
    });
});
