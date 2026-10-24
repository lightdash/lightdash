import {
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getSectionCountLabel,
    groupRulesBySection,
    moveRuleToSection,
    removeSectionFromRules,
    getDragAnnouncements,
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
        );
        expect(ids(next).dimensions).toEqual(['d2', 'd3', 'd1']);
        expect(next.dimensions.every((r) => r.sectionId === 'a')).toBe(true);
    });

    it('takes the section of the rule it is dropped on, unsectioned included', () => {
        const next = moveRuleToSection(
            filters([rule('d1'), rule('d2', 'a'), rule('d3')]),
            'd1',
            { ruleId: 'd2' },
        );
        expect(next.dimensions[1]).toEqual(rule('d1', 'a'));
        const back = moveRuleToSection(next, 'd1', { ruleId: 'd3' });
        expect(back.dimensions[2]).toEqual(rule('d1'));
        expect('sectionId' in back.dimensions[2]).toBe(false);
    });

    it('joins a section after its last member of the same kind, from above or below', () => {
        const fromBelow = moveRuleToSection(
            filters([rule('d1', 'a'), rule('d2', 'a'), rule('d3')]),
            'd3',
            { sectionId: 'a' },
        );
        expect(ids(fromBelow).dimensions).toEqual(['d1', 'd2', 'd3']);
        const fromAbove = moveRuleToSection(
            filters([rule('d0'), rule('d1', 'a'), rule('d2', 'a'), rule('d3')]),
            'd0',
            { sectionId: 'a' },
        );
        expect(ids(fromAbove).dimensions).toEqual(['d1', 'd2', 'd0', 'd3']);
        expect(fromAbove.dimensions[2].sectionId).toBe('a');
    });

    it('moves a metric dropped on a dimension of another section into it, keeping its place', () => {
        const next = moveRuleToSection(
            filters([rule('d1', 'b')], [rule('m1'), rule('m2')]),
            'm1',
            { ruleId: 'd1' },
        );
        expect(ids(next)).toEqual({
            dimensions: ['d1'],
            metrics: ['m1', 'm2'],
        });
        expect(next.metrics[0].sectionId).toBe('b');
    });

    it('joins an empty section in place', () => {
        const next = moveRuleToSection(
            filters([rule('d1'), rule('d2')]),
            'd1',
            { sectionId: 'b' },
        );
        expect(ids(next).dimensions).toEqual(['d1', 'd2']);
        expect(next.dimensions[0].sectionId).toBe('b');
    });

    it('returns the same filters for an unknown rule', () => {
        const dashboardFilters = filters([rule('d1')]);
        expect(
            moveRuleToSection(dashboardFilters, 'missing', { ruleId: 'd1' }),
        ).toBe(dashboardFilters);
        expect(
            moveRuleToSection(dashboardFilters, 'd1', { ruleId: 'missing' }),
        ).toBe(dashboardFilters);
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

describe('getSectionCountLabel', () => {
    it('counts filters', () => {
        expect(getSectionCountLabel(0)).toBe('0 filters');
        expect(getSectionCountLabel(1)).toBe('1 filter');
        expect(getSectionCountLabel(3)).toBe('3 filters');
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
