import {
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    groupRulesBySection,
    moveRuleToSection,
    moveRulesToSection,
    rangeBetween,
    removeSectionFromRules,
    getDragAnnouncements,
    underPointerFor,
} from './sections';

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

const filters = (
    dimensions: DashboardFilterRule[],
    metrics: DashboardFilterRule[] = [],
): DashboardFilters => ({ dimensions, metrics, tableCalculations: [] });

const sections = [
    { id: 'a', name: 'Dates' },
    { id: 'b', name: 'Regions' },
];

const ids = (dashboardFilters: DashboardFilters) => ({
    dimensions: dashboardFilters.dimensions.map((r) => r.id),
    metrics: dashboardFilters.metrics.map((r) => r.id),
});

describe('groupRulesBySection', () => {
    it('lists unsectioned rules first, dangling ids included, then each section in order', () => {
        const grouped = groupRulesBySection(
            filters(
                [rule('d1', 'b'), rule('d2'), rule('d3', 'gone')],
                [rule('m1', 'a'), rule('m2', 'b')],
            ),
            sections,
        );
        expect(
            grouped.map(({ section, rules }) => [
                section?.id ?? null,
                rules.map(({ rule: r, group }) => `${group}:${r.id}`),
            ]),
        ).toEqual([
            [null, ['dimensions:d2', 'dimensions:d3']],
            ['a', ['metrics:m1']],
            ['b', ['dimensions:d1', 'metrics:m2']],
        ]);
    });

    it('keeps an empty section', () => {
        expect(groupRulesBySection(filters([]), sections)).toEqual([
            { section: null, rules: [] },
            { section: sections[0], rules: [] },
            { section: sections[1], rules: [] },
        ]);
    });
});

describe('moveRuleToSection', () => {
    it("reorders within a section, in the rule's own list", () => {
        const next = moveRuleToSection(
            filters([rule('d1', 'a'), rule('d2', 'a'), rule('d3', 'a')]),
            'd1',
            { ruleId: 'd3' },
            sections,
        );
        expect(ids(next).dimensions).toEqual(['d2', 'd3', 'd1']);
        expect(next.dimensions.every((r) => r.sectionId === 'a')).toBe(true);
    });

    it('takes the section of the rule it is dropped on, unsectioned included', () => {
        const next = moveRuleToSection(
            filters([rule('d1'), rule('d2', 'a'), rule('d3')]),
            'd1',
            { ruleId: 'd2' },
            sections,
        );
        expect(next.dimensions[1]).toEqual(rule('d1', 'a'));
        const back = moveRuleToSection(next, 'd1', { ruleId: 'd3' }, sections);
        expect(back.dimensions[2]).toEqual(rule('d1'));
        expect('sectionId' in back.dimensions[2]).toBe(false);
    });

    it('joins a section after its last member of the same kind, from above or below', () => {
        const fromBelow = moveRuleToSection(
            filters([rule('d1', 'a'), rule('d2', 'a'), rule('d3')]),
            'd3',
            { sectionId: 'a' },
            sections,
        );
        expect(ids(fromBelow).dimensions).toEqual(['d1', 'd2', 'd3']);
        const fromAbove = moveRuleToSection(
            filters([rule('d0'), rule('d1', 'a'), rule('d2', 'a'), rule('d3')]),
            'd0',
            { sectionId: 'a' },
            sections,
        );
        expect(ids(fromAbove).dimensions).toEqual(['d1', 'd2', 'd0', 'd3']);
        expect(fromAbove.dimensions[2].sectionId).toBe('a');
    });

    it('moves a metric dropped on a dimension of another section into it, keeping its place', () => {
        const next = moveRuleToSection(
            filters([rule('d1', 'b')], [rule('m1'), rule('m2')]),
            'm1',
            { ruleId: 'd1' },
            sections,
        );
        expect(ids(next)).toEqual({
            dimensions: ['d1'],
            metrics: ['m1', 'm2'],
        });
        expect(next.metrics[0].sectionId).toBe('b');
    });

    it('leaves its section after the last unsectioned rule of its kind, a dangling id included', () => {
        const next = moveRuleToSection(
            filters([
                rule('d1', 'a'),
                rule('d2'),
                rule('d3', 'b'),
                rule('d4', 'gone'),
            ]),
            'd1',
            { sectionId: null },
            sections,
        );
        expect(ids(next).dimensions).toEqual(['d2', 'd3', 'd4', 'd1']);
        expect('sectionId' in next.dimensions[3]).toBe(false);
        // Already unsectioned and after the others: nothing moves
        const last = filters([rule('d1'), rule('d2', 'a'), rule('d3')]);
        expect(moveRulesToSection(last, ['d3'], null, sections)).toBe(last);
    });

    it('joins an empty section in place', () => {
        const next = moveRuleToSection(
            filters([rule('d1'), rule('d2')]),
            'd1',
            { sectionId: 'b' },
            sections,
        );
        expect(ids(next).dimensions).toEqual(['d1', 'd2']);
        expect(next.dimensions[0].sectionId).toBe('b');
    });

    it('returns the same filters when nothing moves', () => {
        const unsectioned = filters([rule('d1'), rule('d2', 'a')]);
        // An unsectioned row dropped on the rail's header
        expect(
            moveRuleToSection(unsectioned, 'd1', { sectionId: null }, sections),
        ).toBe(unsectioned);
        // A dimension dropped on a metric of its own section
        const mixed = filters([rule('d1', 'a')], [rule('m1', 'a')]);
        expect(moveRuleToSection(mixed, 'd1', { ruleId: 'm1' }, sections)).toBe(
            mixed,
        );
        // The only member dropped on its own section's header
        expect(
            moveRuleToSection(mixed, 'd1', { sectionId: 'a' }, sections),
        ).toBe(mixed);
    });

    it('treats a rule of a removed section as unsectioned when dropped on', () => {
        const dangling = filters([rule('d1', 'a'), rule('d2', 'gone')]);
        const next = moveRuleToSection(
            dangling,
            'd1',
            { ruleId: 'd2' },
            sections,
        );
        expect(next.dimensions.map((r) => r.sectionId)).toEqual([
            'gone',
            undefined,
        ]);
        // An unsectioned dimension on a dangling metric: already there
        const mixed = filters([rule('d1')], [rule('m1', 'gone')]);
        expect(moveRuleToSection(mixed, 'd1', { ruleId: 'm1' }, sections)).toBe(
            mixed,
        );
    });

    it('returns the same filters for an unknown rule', () => {
        const dashboardFilters = filters([rule('d1')]);
        expect(
            moveRuleToSection(
                dashboardFilters,
                'missing',
                { ruleId: 'd1' },
                sections,
            ),
        ).toBe(dashboardFilters);
        expect(
            moveRuleToSection(
                dashboardFilters,
                'd1',
                { ruleId: 'missing' },
                sections,
            ),
        ).toBe(dashboardFilters);
    });
});

describe('moveRulesToSection', () => {
    it('moves each rule in the given order to the end of the section, and returns the same object when nothing moves', () => {
        const before = filters([rule('x', 'a'), rule('y'), rule('z')]);
        const moved = moveRulesToSection(before, ['z', 'y'], 'a', sections);
        expect(moved.dimensions.map((r) => [r.id, r.sectionId])).toEqual([
            ['x', 'a'],
            ['z', 'a'],
            ['y', 'a'],
        ]);
        expect(moveRulesToSection(before, ['x'], 'a', sections)).toBe(before);
    });
});

describe('rangeBetween', () => {
    it('returns the ids between two listed ids either way, else null', () => {
        const ids = ['a', 'b', 'c', 'd'];
        expect(rangeBetween(ids, 'b', 'd')).toEqual(['b', 'c', 'd']);
        expect(rangeBetween(ids, 'd', 'b')).toEqual(['b', 'c', 'd']);
        expect(rangeBetween(ids, null, 'b')).toBeNull();
        expect(rangeBetween(ids, 'gone', 'b')).toBeNull();
    });
});

describe('removeSectionFromRules', () => {
    it('unsections the members of both kinds and leaves the rest', () => {
        const next = removeSectionFromRules(
            filters([rule('d1', 'a'), rule('d2', 'b')], [rule('m1', 'a')]),
            'a',
        );
        expect(next.dimensions).toEqual([rule('d1'), rule('d2', 'b')]);
        expect(next.metrics).toEqual([rule('m1')]);
        expect('sectionId' in next.dimensions[0]).toBe(false);
    });

    it('returns the same filters when nothing was in the section', () => {
        const dashboardFilters = filters([rule('d1', 'b')]);
        expect(removeSectionFromRules(dashboardFilters, 'a')).toBe(
            dashboardFilters,
        );
    });
});

describe('getDragAnnouncements', () => {
    it('names what is dragged and where it lands', () => {
        const a = getDragAnnouncements((id) => `[${id}]`);
        const active = { id: 'r1' } as never;
        const over = { id: 's1' } as never;
        expect(a.onDragStart({ active })).toBe('Picked up [r1]');
        expect(a.onDragOver({ active, over })).toBe('[r1] is over [s1]');
        expect(a.onDragEnd({ active, over: null })).toBe('[r1] was dropped');
        expect(a.onDragCancel({ active, over: null })).toBe(
            'Dragging [r1] was cancelled',
        );
    });
});

describe('underPointerFor', () => {
    it('lets a capsule or pill under the pointer win, and anywhere else is outside every section', () => {
        const rect = (left: number, right: number) =>
            ({
                top: 0,
                bottom: 30,
                left,
                right,
                width: right - left,
                height: 30,
            }) as ClientRect;
        const droppableRects = new Map([
            ['bar-space-target', rect(0, 600)],
            ['a', rect(100, 300)],
            ['one', rect(110, 200)],
        ]);
        const collide = (x: number, hasPointer = true) =>
            underPointerFor({
                active: { id: 'two', data: { current: undefined } },
                collisionRect: rect(x, x + 10),
                droppableRects,
                droppableContainers: [...droppableRects.keys()].map((id) => ({
                    id,
                    data: { current: undefined },
                })),
                pointerCoordinates: hasPointer ? { x, y: 15 } : null,
            } as unknown as Parameters<typeof underPointerFor>[0]).map(
                ({ id }) => id,
            );
        expect(collide(150)).toEqual(['one', 'a']);
        expect(collide(250)).toEqual(['a']);
        expect(collide(500)).toEqual(['bar-space-target']);
        // Off the bar altogether (beside or below it) is outside every section too
        expect(collide(800)).toEqual(['bar-space-target']);
        // The keyboard has no pointer: the nearest centre, never the bar's
        expect(collide(295, false)[0]).toBe('a');
    });
});
