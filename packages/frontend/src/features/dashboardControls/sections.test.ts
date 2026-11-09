import {
    DashboardControlRefKind,
    type DashboardControlSection,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    groupSectionsIntoLines,
    moveControlBy,
    placeControl,
    placeSectionChanges,
    getEffectiveControlOrder,
    removeSectionKeepingLines,
    countSectionChanges,
    getMoveNeighbours,
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

    it('lands a capsule dragged into a line’s empty space beside that line’s nearest capsule', () => {
        const rect = (left: number, right: number, top: number, height = 30) =>
            ({
                top,
                bottom: top + height,
                left,
                right,
                width: right - left,
                height,
            }) as ClientRect;
        const section = { current: { kind: 'section' } };
        const gap = { current: { kind: 'section', isLineGap: true } };
        const droppableRects = new Map([
            ['bar-space-target', rect(0, 800, 0)],
            ['section-line:0', rect(0, 800, -12, 12)],
            ['date', rect(0, 300, 0)],
            ['section-line:1', rect(0, 800, 38, 12)],
            ['lenses', rect(0, 700, 50)],
            ['section-line:2', rect(0, 800, 94, 12)],
        ]);
        const dataOf = (id: string) =>
            id.startsWith('section-line')
                ? gap
                : id === 'bar-space-target'
                  ? { current: undefined }
                  : section;
        const collide = (x: number, y: number) =>
            underPointerFor({
                active: { id: 'lenses', data: section },
                collisionRect: rect(x - 40, x + 40, y - 15),
                droppableRects,
                droppableContainers: [...droppableRects.keys()].map((id) => ({
                    id,
                    data: dataOf(id),
                })),
                pointerCoordinates: { x, y },
            } as unknown as Parameters<typeof underPointerFor>[0]).map(
                ({ id }) => id,
            )[0];
        expect(collide(450, 15)).toBe('date');
        expect(collide(150, 15)).toBe('date');
    });

    it('picks the nearest capsule in the pointer’s row across uneven and wrapped rows', () => {
        const rect = (left: number, right: number, top: number, height = 30) =>
            ({
                top,
                bottom: top + height,
                left,
                right,
                width: right - left,
                height,
            }) as ClientRect;
        const section = { current: { kind: 'section' } };
        const gap = { current: { kind: 'section', isLineGap: true } };
        const collideIn =
            (rects: [string, ClientRect][]) => (x: number, y: number) => {
                const droppableRects = new Map(rects);
                return underPointerFor({
                    active: { id: 'moving', data: section },
                    collisionRect: rect(x - 40, x + 40, y - 15),
                    droppableRects,
                    droppableContainers: rects.map(([id]) => ({
                        id,
                        data: id.startsWith('section-line') ? gap : section,
                    })),
                    pointerCoordinates: { x, y },
                } as unknown as Parameters<typeof underPointerFor>[0])[0]?.id;
            };
        // An open capsule beside a collapsed one: below the short one's bottom
        const uneven = collideIn([
            ['section-line:0', rect(0, 800, -12, 12)],
            ['open', rect(0, 300, 0, 200)],
            ['short', rect(310, 500, 0, 30)],
            ['section-line:1', rect(0, 800, 202, 12)],
        ]);
        expect(uneven(600, 100)).toBe('short');
        // A wrapped line: the space between its rows is no line gap
        const wrapped = collideIn([
            ['section-line:0', rect(0, 400, -12, 12)],
            ['a', rect(0, 150, 0, 36)],
            ['b', rect(160, 300, 0, 36)],
            ['c', rect(0, 150, 52, 36)],
            ['section-line:1', rect(0, 400, 90, 12)],
        ]);
        expect(wrapped(250, 44)).toBe('b');
        // Below every capsule still reaches the end line gap
        expect(wrapped(200, 300)).toBe('section-line:1');
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

describe('section lines', () => {
    const a = { id: 'a', name: 'A' };
    const b: DashboardControlSection = { id: 'b', name: 'B', inline: true };
    const c = { id: 'c', name: 'C' };
    const d: DashboardControlSection = { id: 'd', name: 'D', inline: true };
    const lineIds = (list: DashboardControlSection[]) =>
        groupSectionsIntoLines(list).map((line) => line.map(({ id }) => id));

    it('starts a line at every section that is not inline, the first always', () => {
        expect(lineIds([{ ...a, inline: true }, b, c, d])).toEqual([
            ['a', 'b'],
            ['c', 'd'],
        ]);
    });

    it('keeps a line start when its first section is removed', () => {
        const next = removeSectionKeepingLines([a, b, c, d], 'a');
        expect(lineIds(next)).toEqual([['b'], ['c', 'd']]);
        expect(next[0]).not.toHaveProperty('inline');
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
});
