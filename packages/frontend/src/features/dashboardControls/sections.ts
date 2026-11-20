import {
    closestCenter,
    pointerWithin,
    type Announcements,
    type CollisionDetection,
    type Modifier,
} from '@dnd-kit/core';
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

export type MoveNeighbours = { before: string | null; after: string | null };

/**
 * The pills a pill moves past with Alt+arrow or Move left / right: its kind,
 * in its section (or the unsectioned run), shown on the tab in view
 */
export const getMoveNeighbours = (
    filters: DashboardFilters,
    filterId: string,
    sections: DashboardControlSection[],
    isShown: (rule: DashboardFilterRule) => boolean,
): MoveNeighbours => {
    const group = FILTER_GROUPS.find((candidate) =>
        filters[candidate].some((rule) => rule.id === filterId),
    );
    const rule = group && filters[group].find(({ id }) => id === filterId);
    if (group === undefined || rule === undefined)
        return { before: null, after: null };
    const sectionId = isRuleInSection(rule, null, sections)
        ? null
        : (rule.sectionId ?? null);
    const peers = filters[group].filter(
        (other) =>
            other === rule ||
            (isRuleInSection(other, sectionId, sections) && isShown(other)),
    );
    const index = peers.indexOf(rule);
    return {
        before: peers[index - 1]?.id ?? null,
        after: peers[index + 1]?.id ?? null,
    };
};

// Dimensions and metrics, as the tracking events count filters
export const countFilters = (filters: DashboardFilters): number =>
    filters.dimensions.length + filters.metrics.length;

// Rules present in both whose shown section differs (a dangling id is none):
// a reorder counts none
export const countSectionChanges = (
    before: DashboardFilters,
    after: DashboardFilters,
    sections: DashboardControlSection[],
): number => {
    const sectionOf = (rule: DashboardFilterRule) =>
        isRuleInSection(rule, null, sections) ? null : rule.sectionId;
    const beforeById = new Map(
        listRules(before).map(({ rule }) => [rule.id, sectionOf(rule)]),
    );
    return listRules(after).filter(
        ({ rule }) =>
            beforeById.has(rule.id) &&
            beforeById.get(rule.id) !== sectionOf(rule),
    ).length;
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
 * section and, within its own list, that rule's place; on a section (or
 * none), it joins it after its last member of the same kind.
 */
// A pill's drop: on another pill (its section and place) or a section (null: none)
export type RuleDropTarget = { ruleId: string } | { sectionId: string | null };

export const moveRuleToSection = (
    filters: DashboardFilters,
    activeId: string,
    over: RuleDropTarget,
    sections: DashboardControlSection[],
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
    // A rule whose section is gone sits with the unsectioned ones
    const sectionId =
        'sectionId' in over
            ? over.sectionId
            : overRule === undefined ||
                isRuleInSection(overRule, null, sections)
              ? null
              : (overRule.sectionId ?? null);
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
        // Joining a section (none included): after its last member of this
        // kind, else in place; a member already after it stays
        const last = list.reduce(
            (found, rule, index) =>
                rule.id !== activeId &&
                isRuleInSection(rule, sectionId, sections)
                    ? index
                    : found,
            -1,
        );
        const isMember = isRuleInSection(
            filters[group][active.index],
            sectionId,
            sections,
        );
        to =
            last === -1 || (isMember && active.index > last)
                ? active.index
                : active.index > last
                  ? last + 1
                  : last;
    }
    // Nothing moved: the same object, so nothing is marked changed
    if (
        to === active.index &&
        (filters[group][active.index].sectionId ?? null) === sectionId
    )
        return filters;
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

/** Each rule, in the given order, joins the section at its end */
export const moveRulesToSection = (
    filters: DashboardFilters,
    ids: string[],
    sectionId: string | null,
    sections: DashboardControlSection[],
): DashboardFilters =>
    ids.reduce(
        (moved, id) => moveRuleToSection(moved, id, { sectionId }, sections),
        filters,
    );

/** The ids from one to the other, both included; null when either is not listed */
export const rangeBetween = (
    ids: string[],
    fromId: string | null,
    toId: string,
): string[] | null => {
    const from = fromId === null ? -1 : ids.indexOf(fromId);
    const to = ids.indexOf(toId);
    if (from === -1 || to === -1) return null;
    return ids.slice(Math.min(from, to), Math.max(from, to) + 1);
};

/** With no saved choice, a section with more members than this starts collapsed */
const COLLAPSED_BY_DEFAULT_ABOVE = 6;

/** Whether a section starts collapsed: its saved choice, else its size */
export const isCollapsedByDefault = (
    section: DashboardControlSection,
    memberCount: number,
): boolean => section.collapsed ?? memberCount > COLLAPSED_BY_DEFAULT_ABOVE;

/** The droppable id of the gap before the bar line `lineStartId` starts (null: after the last) */
export const lineGapTargetId = (lineStartId: string | null) =>
    `line-gap:${lineStartId ?? ''}`;

/** The placement a line gap's id names, else null */
export const lineGapPlacementOf = (
    id: string,
): { lineStartId: string | null } | null =>
    id.startsWith('line-gap:')
        ? { lineStartId: id.slice('line-gap:'.length) || null }
        : null;

/** The droppable id of the controls bar's header, which takes a filter out of its section */
export const UNSECTIONED_TARGET_ID = 'unsectioned-target';

/**
 * The dragged copy floats just below-right of the pointer, so the drop line
 * by the pointer stays in sight; a keyboard drag's copy stays on its control
 */
export const besidePointer: Modifier = ({
    activatorEvent,
    draggingNodeRect,
    transform,
}) =>
    draggingNodeRect !== null &&
    activatorEvent !== null &&
    'clientX' in activatorEvent
        ? {
              ...transform,
              x:
                  transform.x +
                  (activatorEvent as PointerEvent).clientX -
                  draggingNodeRect.left +
                  12,
              y:
                  transform.y +
                  (activatorEvent as PointerEvent).clientY -
                  draggingNodeRect.top +
                  8,
          }
        : transform;

/** The droppable id of the bar's New section capsule */
export const NEW_SECTION_TARGET_ID = 'new-section-target';

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

// A keyboard drag's target: the nearest centre; a pointer's only what is
// under it, as its drop comes from `chooseInsertionPoint`; a dragged capsule only meets capsules, line gaps
// and controls outside every section (`sectionTargetIds`), a pill no line gap
export const SECTION_DRAG = 'section';
const NO_IDS: ReadonlySet<string> = new Set();
export const underPointerFor = (
    args: Parameters<CollisionDetection>[0],
    sectionTargetIds: ReadonlySet<string> = NO_IDS,
): ReturnType<CollisionDetection> => {
    const isSectionDrag = args.active.data?.current?.kind === SECTION_DRAG;
    const droppableContainers = args.droppableContainers.filter((container) =>
        isSectionDrag
            ? container.data?.current?.kind === SECTION_DRAG ||
              sectionTargetIds.has(String(container.id))
            : container.data?.current?.isLineGap !== true,
    );
    return args.pointerCoordinates === null
        ? closestCenter({ ...args, droppableContainers })
        : pointerWithin({ ...args, droppableContainers });
};
