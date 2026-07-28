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
        expect(groupDataAppVizOptions([])).toEqual([]);
    });

    it('keeps declaration order and merges repeated groups', () => {
        const groups = groupDataAppVizOptions([
            option('a', 'Style'),
            option('b', 'Axes'),
            option('c', 'Style'),
        ]);

        expect(groups.map((g) => g.label)).toEqual(['Style', 'Axes']);
        expect(groups[0].options.map((o) => o.name)).toEqual(['a', 'c']);
        expect(groups[1].options.map((o) => o.name)).toEqual(['b']);
    });

    it('collapses every ungrouped option into a single Display group', () => {
        const groups = groupDataAppVizOptions([
            option('a'),
            option('b', 'Style'),
            option('c'),
        ]);

        expect(groups.map((g) => g.label)).toEqual([
            UNGROUPED_OPTIONS_LABEL,
            'Style',
        ]);
        expect(groups[0].options.map((o) => o.name)).toEqual(['a', 'c']);
    });
});
