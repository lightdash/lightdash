import { type Announcements } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import {
    type DashboardControlSection,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';

export type FilterGroup = 'dimensions' | 'metrics';

const FILTER_GROUPS: FilterGroup[] = ['dimensions', 'metrics'];

export type SectionRule = { rule: DashboardFilterRule; group: FilterGroup };

export type RuleSection = {
    /** Null for the unsectioned rules, which come first */
    section: DashboardControlSection | null;
    rules: SectionRule[];
};

const listRules = (filters: DashboardFilters): SectionRule[] =>
    FILTER_GROUPS.flatMap((group) =>
        filters[group].map((rule) => ({ rule, group })),
    );

/** Unsectioned rules first (a dangling section id counts), then each section in order */
export const groupRulesBySection = (
    filters: DashboardFilters,
    sections: DashboardControlSection[],
): RuleSection[] => {
    const rules = listRules(filters);
    const sectionIds = new Set(sections.map((section) => section.id));
    return [
        {
            section: null,
            rules: rules.filter(
                ({ rule }) =>
                    rule.sectionId === undefined ||
                    !sectionIds.has(rule.sectionId),
            ),
        },
        ...sections.map((section) => ({
            section,
            rules: rules.filter(({ rule }) => rule.sectionId === section.id),
        })),
    ];
};

/**
 * Whether a rule belongs to the pass `sectionId` names: `undefined` is every
 * rule, `null` the unsectioned ones (a dangling id counts), a string that
 * section's members
 */
export const isRuleInSection = (
    rule: DashboardFilterRule,
    sectionId: string | null | undefined,
    sections: DashboardControlSection[],
): boolean => {
    if (sectionId === undefined) return true;
    if (sectionId === null) {
        return (
            rule.sectionId === undefined ||
            !sections.some((section) => section.id === rule.sectionId)
        );
    }
    return rule.sectionId === sectionId;
};

const withSection = (
    rule: DashboardFilterRule,
    sectionId: string | null,
): DashboardFilterRule => {
    if (sectionId === null) {
        const { sectionId: _dropped, ...rest } = rule;
        return rest;
    }
    return { ...rule, sectionId };
};

const findRule = (
    filters: DashboardFilters,
    id: string,
): { group: FilterGroup; index: number } | null => {
    for (const group of FILTER_GROUPS) {
        const index = filters[group].findIndex((rule) => rule.id === id);
        if (index !== -1) return { group, index };
    }
    return null;
};

/**
 * Drops the rule `activeId` on `over`: on a rule, it takes that rule's
 * section and, within its own list, that rule's place; on a section, it
 * joins that section after its last member of the same kind.
 */
export const moveRuleToSection = (
    filters: DashboardFilters,
    activeId: string,
    over: { ruleId: string } | { sectionId: string | null },
): DashboardFilters => {
    const active = findRule(filters, activeId);
    if (active === null) return filters;
    const { group } = active;
    const overRule =
        'ruleId' in over
            ? FILTER_GROUPS.flatMap((g) => filters[g]).find(
                  (rule) => rule.id === over.ruleId,
              )
            : undefined;
    if ('ruleId' in over && overRule === undefined) return filters;
    const sectionId =
        'sectionId' in over ? over.sectionId : (overRule?.sectionId ?? null);
    const moved = withSection(filters[group][active.index], sectionId);
    const list = filters[group].map((rule, index) =>
        index === active.index ? moved : rule,
    );
    const overIndex =
        'ruleId' in over
            ? list.findIndex((rule) => rule.id === over.ruleId)
            : -1;
    let to: number;
    if (overIndex !== -1) {
        to = overIndex;
    } else {
        // Joining a section: after its last member of this kind, else in place
        const last = list.reduce(
            (found, rule, index) =>
                rule.id !== activeId &&
                (rule.sectionId ?? null) === sectionId &&
                sectionId !== null
                    ? index
                    : found,
            -1,
        );
        to = last === -1 ? active.index : active.index > last ? last + 1 : last;
    }
    return { ...filters, [group]: arrayMove(list, active.index, to) };
};

/** Takes every rule out of the section; the same object when none was in it */
export const removeSectionFromRules = (
    filters: DashboardFilters,
    sectionId: string,
): DashboardFilters => {
    const hasMember = FILTER_GROUPS.some((group) =>
        filters[group].some((rule) => rule.sectionId === sectionId),
    );
    if (!hasMember) return filters;
    return {
        ...filters,
        dimensions: filters.dimensions.map((rule) =>
            rule.sectionId === sectionId ? withSection(rule, null) : rule,
        ),
        metrics: filters.metrics.map((rule) =>
            rule.sectionId === sectionId ? withSection(rule, null) : rule,
        ),
    };
};

/** The droppable id of the rail's header, which takes a filter out of its section */
export const UNSECTIONED_TARGET_ID = 'unsectioned-target';

/** Screen reader wording for a drag; dnd-kit only knows the ids */
export const getDragAnnouncements = (
    nameOf: (id: string) => string,
): Announcements => ({
    onDragStart: ({ active }) => `Picked up ${nameOf(String(active.id))}`,
    onDragOver: ({ active, over }) =>
        over
            ? `${nameOf(String(active.id))} is over ${nameOf(String(over.id))}`
            : `${nameOf(String(active.id))} is no longer over a drop target`,
    onDragEnd: ({ active, over }) =>
        over
            ? `${nameOf(String(active.id))} was dropped on ${nameOf(String(over.id))}`
            : `${nameOf(String(active.id))} was dropped`,
    onDragCancel: ({ active }) =>
        `Dragging ${nameOf(String(active.id))} was cancelled`,
});
