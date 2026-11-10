import {
    DashboardControlRefKind,
    reconcileDashboardControlOrder,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    moveControlBy,
    placeControl,
    placeSectionChanges,
    getEffectiveControlOrder,
} from './controlOrder';
import {
    countSectionChanges,
    getMoveNeighbours,
    groupRulesBySection,
    moveRuleToSection,
    moveRulesToSection,
    rangeBetween,
    removeSectionFromRules,
    getDragAnnouncements,
    underPointerFor,
    besidePointer,
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

describe('countSectionChanges', () => {
    it('counts rules whose section changed, a dangling id being none', () => {
        const before = filters([rule('d1', 'gone'), rule('d2'), rule('d3')]);
        // d1 normalised out of its dangling section, d3 into a
        const after = filters([rule('d2'), rule('d1'), rule('d3', 'a')]);
        expect(countSectionChanges(before, after, sections)).toBe(1);
        expect(
            countSectionChanges(
                before,
                filters([rule('d2'), rule('d1'), rule('d3')]),
                sections,
            ),
        ).toBe(0);
    });
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
    const rect = (left: number, right: number, top = 0) =>
        ({
            top,
            bottom: top + 30,
            left,
            right,
            width: right - left,
            height: 30,
        }) as ClientRect;
    const section = { current: { kind: 'section' } };
    const gap = { current: { kind: 'section', isLineGap: true } };
    const droppableRects = new Map([
        ['a', rect(100, 300)],
        ['one', rect(110, 200)],
        ['loose', rect(400, 480)],
        ['line-gap:', rect(0, 600, 40)],
    ]);
    const dataOf = (id: string) =>
        id === 'a'
            ? section
            : id.startsWith('line-gap')
              ? gap
              : { current: undefined };
    const collide = (
        activeData: { current: unknown },
        x: number,
        hasPointer: boolean,
        sectionTargetIds?: ReadonlySet<string>,
    ) =>
        underPointerFor(
            {
                active: { id: 'moving', data: activeData },
                collisionRect: rect(x, x + 10, hasPointer ? 0 : 45),
                droppableRects,
                droppableContainers: [...droppableRects.keys()].map((id) => ({
                    id,
                    data: dataOf(id),
                })),
                pointerCoordinates: hasPointer ? { x, y: 15 } : null,
            } as unknown as Parameters<typeof underPointerFor>[0],
            sectionTargetIds,
        ).map(({ id }) => id);

    it('gives a pointer what is under it, and the keyboard the nearest centre', () => {
        expect(collide({ current: undefined }, 150, true)).toEqual(
            expect.arrayContaining(['one', 'a']),
        );
        // A pill's keyboard drag never lands on a line gap
        expect(collide({ current: undefined }, 300, false)).not.toContain(
            'line-gap:',
        );
    });

    it('lets a dragged capsule meet only capsules, line gaps and the controls it may sit beside', () => {
        expect(collide(section, 150, true)).toEqual(['a']);
        expect(collide(section, 440, true)).toEqual([]);
        expect(collide(section, 440, true, new Set(['loose']))).toEqual([
            'loose',
        ]);
    });
});

describe('besidePointer', () => {
    const transform = { x: 5, y: 7, scaleX: 1, scaleY: 1 };
    const args = (activatorEvent: unknown) =>
        ({
            activatorEvent,
            draggingNodeRect: { left: 100, top: 50 },
            transform,
        }) as unknown as Parameters<typeof besidePointer>[0];

    it("puts the dragged copy's top-left 12px right of and 8px below the pointer", () => {
        expect(besidePointer(args({ clientX: 130, clientY: 60 }))).toEqual({
            ...transform,
            x: 5 + 30 + 12,
            y: 7 + 10 + 8,
        });
    });

    it("leaves a keyboard drag's copy on its control", () => {
        expect(besidePointer(args({ key: ' ' }))).toBe(transform);
    });
});

describe('getMoveNeighbours', () => {
    const shown = () => true;

    it('stays in the kind and section, skipping pills not on the tab', () => {
        const bar = filters(
            [rule('d1'), rule('s1', 'a'), rule('hidden'), rule('d2')],
            [rule('m1')],
        );
        expect(
            getMoveNeighbours(bar, 'd1', sections, (r) => r.id !== 'hidden'),
        ).toEqual({ before: null, after: 'd2' });
        expect(getMoveNeighbours(bar, 's1', sections, shown)).toEqual({
            before: null,
            after: null,
        });
        expect(getMoveNeighbours(bar, 'm1', sections, shown)).toEqual({
            before: null,
            after: null,
        });
        expect(getMoveNeighbours(bar, 'gone', sections, shown)).toEqual({
            before: null,
            after: null,
        });
    });
});

describe('bar order', () => {
    const { FILTER, PARAMETER, SECTION } = DashboardControlRefKind;
    // `/` starts a line, `S>` is a member of S
    const parse = (shape: string) =>
        shape.split(' ').map((token) => {
            const newLine = token.startsWith('/');
            const [sectionId, id] = token.replace('/', '').includes('>')
                ? token.replace('/', '').split('>')
                : [null, token.replace('/', '')];
            return {
                kind: id.startsWith('S')
                    ? SECTION
                    : id.startsWith('p')
                      ? PARAMETER
                      : FILTER,
                id,
                sectionId,
                newLine,
            };
        });
    const shapeOf = (list: ReturnType<typeof parse>) =>
        list
            .map(
                ({ id, sectionId, newLine }) =>
                    `${newLine ? '/' : ''}${sectionId ? `${sectionId}>` : ''}${id}`,
            )
            .join(' ');
    const bar = parse('f1 p1 /S S>f2 S>p2 f3 /f4');
    const place = (id: string, placement: Parameters<typeof placeControl>[2]) =>
        shapeOf(placeControl(bar, id, placement));
    const move = (
        id: string,
        direction: 'left' | 'right' | 'up' | 'down',
        list = bar,
    ) => shapeOf(moveControlBy(list, id, direction, () => true));

    it('drops beside any control, joining its line and section', () => {
        expect(place('f3', { overId: 'p1', side: 'before' })).toBe(
            'f1 f3 p1 /S S>f2 S>p2 /f4',
        );
        // A line start passes to the next control on the bar
        expect(place('S', { overId: 'f4', side: 'after' })).toBe(
            'f1 p1 /f3 /f4 S S>f2 S>p2',
        );
        // Before a line's first control it takes the line's start
        expect(place('f1', { overId: 'f4', side: 'before' })).toBe(
            'p1 /S S>f2 S>p2 f3 /f1 f4',
        );
        expect(place('f1', { overId: 'f2', side: 'before' })).toBe(
            'p1 /S S>f1 S>f2 S>p2 f3 /f4',
        );
    });

    it('starts a line on a line gap', () => {
        expect(place('f1', { lineStartId: 'S' })).toBe(
            'p1 /f1 /S S>f2 S>p2 f3 /f4',
        );
        expect(place('p2', { lineStartId: null })).toBe(
            'f1 p1 /S S>f2 f3 /f4 /p2',
        );
    });

    it('joins a section last, and leaves one right after it', () => {
        expect(place('f1', { sectionId: 'S' })).toBe(
            'p1 /S S>f2 S>p2 S>f1 f3 /f4',
        );
        expect(place('f2', { sectionId: null })).toBe(
            'f1 p1 /S S>p2 f2 f3 /f4',
        );
        // Outside every section: the end of the first line
        expect(place('f4', { sectionId: null })).toBe(
            'f1 p1 f4 /S S>f2 S>p2 f3',
        );
    });

    it('returns the same list when nothing moves, or a section would enter one', () => {
        expect(placeControl(bar, 'p1', { overId: 'f1', side: 'after' })).toBe(
            bar,
        );
        expect(placeControl(bar, 'S', { overId: 'f2', side: 'after' })).toBe(
            bar,
        );
        expect(placeControl(bar, 'S', { sectionId: 'S' })).toBe(bar);
    });

    it('moves by keyboard across kinds, stepping over a section', () => {
        expect(move('f3', 'left')).toBe('f1 p1 /f3 S S>f2 S>p2 /f4');
        expect(move('p1', 'right')).toBe('f1 /S S>f2 S>p2 p1 f3 /f4');
        // Inside a section, among its members
        expect(move('f2', 'right')).toBe('f1 p1 /S S>p2 S>f2 f3 /f4');
        expect(moveControlBy(bar, 'p2', 'right', () => true)).toBe(bar);
    });

    it('joins the line above or below by keyboard, or a line of its own at the bottom', () => {
        expect(move('f4', 'up')).toBe('f1 p1 /S S>f2 S>p2 f3 f4');
        expect(move('p1', 'down')).toBe('f1 /S S>f2 S>p2 f3 p1 /f4');
        // The first line is "Add filter"'s: nothing above it
        expect(moveControlBy(bar, 'f1', 'up', () => true)).toBe(bar);
        // Alone on the last line: nowhere to go; sharing it: a line of its own
        expect(moveControlBy(bar, 'f4', 'down', () => true)).toBe(bar);
        const shared = parse('f1 /S f4');
        expect(move('f4', 'down', shared)).toBe('f1 /S /f4');
        // Up onto a first line holding only "Add filter"
        expect(move('S', 'up', parse('/S S>f2 /f4'))).toBe('S S>f2 /f4');
        // A member never changes lines
        expect(moveControlBy(bar, 'f2', 'up', () => true)).toBe(bar);
    });

    it('steps over controls not shown on the tab', () => {
        expect(
            shapeOf(moveControlBy(bar, 'f1', 'right', ({ id }) => id !== 'p1')),
        ).toBe('p1 /S S>f2 S>p2 f1 f3 /f4');
    });

    it('places every section change: last in the new section, right after the one left', () => {
        const after = parse('S>f1 p1 /S f2 S>p2 f3 /f4');
        expect(shapeOf(placeSectionChanges(bar, after))).toBe(
            'p1 /S S>p2 S>f1 f2 f3 /f4',
        );
        expect(placeSectionChanges(bar, bar)).toBe(bar);
        // Several leaving one section keep their order
        expect(
            shapeOf(placeSectionChanges(bar, parse('f1 p1 /S f2 p2 f3 /f4'))),
        ).toBe('f1 p1 /S f2 p2 f3 /f4');
    });

    it('treats an empty order as none, and puts never saved parameter controls before the first section', () => {
        const control = {
            id: 'p',
            label: 'p',
            value: null,
            valueType: { type: 'string' as const, multiple: false },
            parameters: {},
        };
        expect(getEffectiveControlOrder([], [control], false)).toBeUndefined();
        const order = [
            { kind: FILTER, id: 'f' },
            { kind: SECTION, id: 'S', newLine: true },
        ];
        expect(getEffectiveControlOrder(order, [control], true)).toBe(order);
        expect(getEffectiveControlOrder(order, [control], false)).toEqual([
            { kind: FILTER, id: 'f' },
            { kind: PARAMETER, id: 'p' },
            { kind: SECTION, id: 'S', newLine: true },
        ]);
    });

    it('keeps never saved parameter controls where an order already lists them', () => {
        const control = {
            id: 'p',
            label: 'p',
            value: null,
            valueType: { type: 'string' as const, multiple: false },
            parameters: {},
        };
        // A section dragged first on the bar, before the parameter control
        const order = [
            { kind: SECTION, id: 'S' },
            { kind: PARAMETER, id: 'p' },
            { kind: FILTER, id: 'f' },
        ];
        const effective = getEffectiveControlOrder(order, [control], false);
        expect(effective).toBe(order);
        expect(
            reconcileDashboardControlOrder({
                controlOrder: effective,
                filters: {
                    dimensions: [rule('f')],
                    metrics: [],
                },
                parameterControls: [control],
                sections: [{ id: 'S', name: 'S' }],
            }).map(({ id }) => id),
        ).toEqual(['S', 'p', 'f']);
    });
});
