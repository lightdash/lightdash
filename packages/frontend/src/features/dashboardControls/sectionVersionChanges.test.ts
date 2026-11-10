import {
    type DashboardControlSection,
    type DashboardFilterRule,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getSectionChangeRows,
    hasControlSections,
} from './sectionVersionChanges';

const rule = (id: string, sectionId?: string): DashboardFilterRule => {
    const base: DashboardFilterRule = {
        id,
        operator: 'equals' as DashboardFilterRule['operator'],
        target: { fieldId: `orders_${id}`, tableName: 'orders' },
        values: [],
        label: undefined,
    };
    return sectionId === undefined ? base : { ...base, sectionId };
};

const side = (
    controlSections: DashboardControlSection[],
    dimensions: DashboardFilterRule[] = [],
) => ({
    config: { isDateZoomDisabled: false, controlSections },
    filters: { dimensions, metrics: [], tableCalculations: [] },
});

const rows = (
    current: ReturnType<typeof side>,
    selected: ReturnType<typeof side>,
) => getSectionChangeRows(current, selected, (r) => r.target.fieldId);

const a = { id: 'a', name: 'Geo' };
const b = { id: 'b', name: 'Time' };

describe('getSectionChangeRows', () => {
    it('lists nothing when sections and membership match', () => {
        const same = side([a, b], [rule('x', 'a')]);
        expect(rows(same, side([a, b], [rule('x', 'a')]))).toEqual([]);
    });

    it('shows an added section', () => {
        expect(rows(side([a]), side([a, b]))).toEqual([
            { key: 'section:b', current: null, selected: '"Time"' },
        ]);
    });

    it('shows a removed section', () => {
        expect(rows(side([a, b]), side([a]))).toEqual([
            { key: 'section:b', current: '"Time"', selected: null },
        ]);
    });

    it('shows a renamed section', () => {
        expect(rows(side([a]), side([{ ...a, name: 'Place' }]))).toEqual([
            {
                key: 'section:a',
                current: '"Geo", position 1',
                selected: '"Place", position 1',
            },
        ]);
    });

    it('shows a reorder only for the sections that moved', () => {
        expect(rows(side([a, b]), side([b, a]))).toEqual([
            {
                key: 'section:a',
                current: '"Geo", position 1',
                selected: '"Geo", position 2',
            },
            {
                key: 'section:b',
                current: '"Time", position 2',
                selected: '"Time", position 1',
            },
        ]);
    });

    it('never reads an added section as a reorder of the others', () => {
        expect(rows(side([a]), side([b, a]))).toEqual([
            { key: 'section:b', current: null, selected: '"Time"' },
        ]);
    });

    it('shows a section folded by default', () => {
        expect(rows(side([a]), side([{ ...a, collapsed: true }]))).toEqual([
            {
                key: 'section:a',
                current: '"Geo", position 1',
                selected: '"Geo", position 1, collapsed by default',
            },
        ]);
    });

    const members = (count: number, sectionId: string) =>
        Array.from({ length: count }, (_, i) => rule(`m${i}`, sectionId));

    it('shows a saved open choice that restoring would drop for the size fold', () => {
        expect(
            rows(
                side([{ ...a, collapsed: false }], members(8, 'a')),
                side([a], members(8, 'a')),
            ),
        ).toEqual([
            {
                key: 'section:a',
                current: '"Geo", position 1',
                selected: '"Geo", position 1, collapsed by default',
            },
        ]);
    });

    it('reads a saved fold and the size fold as no change', () => {
        expect(
            rows(
                side([{ ...a, collapsed: true }], members(8, 'a')),
                side([a], members(8, 'a')),
            ),
        ).toEqual([]);
    });

    it('shows a section crossing the size fold with no saved choice', () => {
        expect(
            rows(side([a], members(7, 'a')), side([a], members(3, 'a'))),
        ).toEqual([
            {
                key: 'section:a',
                current: '"Geo", position 1, collapsed by default',
                selected: '"Geo", position 1',
            },
        ]);
    });

    it('shows a rename with a member as the rename alone', () => {
        expect(
            rows(
                side([a], [rule('x', 'a')]),
                side([{ ...a, name: 'Place' }], [rule('x', 'a')]),
            ),
        ).toEqual([
            {
                key: 'section:a',
                current: '"Geo", position 1',
                selected: '"Place", position 1',
            },
        ]);
    });

    it('shows a move between two sections of the same name', () => {
        const twin = { id: 'b', name: 'Geo' };
        expect(
            rows(
                side([a, twin], [rule('x', 'a')]),
                side([a, twin], [rule('x', 'b')]),
            ),
        ).toEqual([
            {
                key: 'filter:x',
                current: 'orders_x in "Geo"',
                selected: 'orders_x in "Geo"',
            },
        ]);
    });

    it('shows a filter moved between sections, a dangling id as none', () => {
        expect(
            rows(
                side([a, b], [rule('x', 'a'), rule('y', 'gone')]),
                side([a, b], [rule('x', 'b'), rule('y')]),
            ),
        ).toEqual([
            {
                key: 'filter:x',
                current: 'orders_x in "Geo"',
                selected: 'orders_x in "Time"',
            },
        ]);
    });
});

describe('hasControlSections', () => {
    it('is true when either version has a section', () => {
        expect(hasControlSections(side([]), side([a]))).toBe(true);
        expect(hasControlSections(side([]), side([]))).toBe(false);
    });
});
