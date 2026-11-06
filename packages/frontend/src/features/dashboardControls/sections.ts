import {
    closestCenter,
    pointerWithin,
    type Announcements,
    type CollisionDetection,
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

/**
 * The bar's section lines, in order: a section starts a line unless it is
 * `inline`, then it shares the line of the section before it. The first
 * section always starts one
 */
export const groupSectionsIntoLines = <T extends DashboardControlSection>(
    sections: T[],
): T[][] =>
    sections.reduce<T[][]>((lines, section) => {
        const last = lines.at(-1);
        if (section.inline && last !== undefined) last.push(section);
        else lines.push([section]);
        return lines;
    }, []);

/** Writes `inline` only where it is true, and never on a line's first section */
const withLineKeys = (
    section: DashboardControlSection,
    inline: boolean,
): DashboardControlSection => {
    const { inline: previous, ...rest } = section;
    return inline ? { ...rest, inline: true } : rest;
};

const normaliseLines = (
    sections: DashboardControlSection[],
): DashboardControlSection[] =>
    sections.map((section, index) =>
        withLineKeys(section, index > 0 && section.inline === true),
    );

/** Takes a section out; the section after it keeps its line's start */
export const removeSectionKeepingLines = (
    sections: DashboardControlSection[],
    id: string,
): DashboardControlSection[] => {
    const index = sections.findIndex((section) => section.id === id);
    if (index === -1) return sections;
    const removed = sections[index];
    return normaliseLines(
        sections.flatMap((section, i) => {
            if (i === index) return [];
            // It started a line: the next one, sharing it, starts it now
            if (i === index + 1 && !removed.inline)
                return [withLineKeys(section, false)];
            return [section];
        }),
    );
};

/**
 * Where a dragged section lands: beside another section (`side` of it, on
 * its line) or on a line of its own before the line `lineIndex`, counting
 * the lines on screen (the line count: after the last line)
 */
export type SectionPlacement =
    | { overId: string; side: 'before' | 'after' }
    | { lineIndex: number };

/** Puts the section `id` at `placement`; the same array when nothing moves */
export const placeSection = (
    sections: DashboardControlSection[],
    id: string,
    placement: SectionPlacement,
): DashboardControlSection[] => {
    const moving = sections.find((section) => section.id === id);
    if (moving === undefined) return sections;
    if ('overId' in placement && placement.overId === id) return sections;
    const rest = removeSectionKeepingLines(sections, id);
    let next: DashboardControlSection[];
    if ('overId' in placement) {
        const overIndex = rest.findIndex((s) => s.id === placement.overId);
        if (overIndex === -1) return sections;
        const over = rest[overIndex];
        next =
            placement.side === 'after'
                ? [
                      ...rest.slice(0, overIndex + 1),
                      withLineKeys(moving, true),
                      ...rest.slice(overIndex + 1),
                  ]
                : [
                      ...rest.slice(0, overIndex),
                      // It takes the line's start when the section it goes before had it
                      withLineKeys(moving, over.inline === true),
                      withLineKeys(over, true),
                      ...rest.slice(overIndex + 1),
                  ];
    } else {
        // `lineIndex` counts the lines on screen, the moving section's own
        // included: a line it leaves empty goes
        const current = groupSectionsIntoLines(sections);
        const own = current.findIndex((line) =>
            line.some((section) => section.id === id),
        );
        const lineIndex =
            current[own].length === 1 && placement.lineIndex > own
                ? placement.lineIndex - 1
                : placement.lineIndex;
        const lines = groupSectionsIntoLines(rest);
        const at = Math.max(0, Math.min(lineIndex, lines.length));
        const index = lines.slice(0, at).flat().length;
        next = [
            ...rest.slice(0, index),
            withLineKeys(moving, false),
            ...rest.slice(index),
        ];
    }
    next = normaliseLines(next);
    const shape = (list: DashboardControlSection[]) =>
        normaliseLines(list)
            .map(({ id: key, inline }) => `${key}:${inline ? 1 : 0}`)
            .join(',');
    return shape(next) === shape(sections) ? sections : next;
};

/**
 * A keyboard move: Alt+Left/Right goes one place along the bar, joining the
 * neighbour's line; Alt+Up/Down joins the line above or below, or takes a
 * line of its own at the top or bottom when it shares its line
 */
export const moveSectionBy = (
    sections: DashboardControlSection[],
    id: string,
    direction: 'left' | 'right' | 'up' | 'down',
): DashboardControlSection[] => {
    const index = sections.findIndex((section) => section.id === id);
    if (index === -1) return sections;
    if (direction === 'left' || direction === 'right') {
        const neighbour =
            sections[direction === 'left' ? index - 1 : index + 1];
        if (neighbour === undefined) return sections;
        return placeSection(sections, id, {
            overId: neighbour.id,
            side: direction === 'left' ? 'before' : 'after',
        });
    }
    const lines = groupSectionsIntoLines(sections);
    const lineIndex = lines.findIndex((line) =>
        line.some((section) => section.id === id),
    );
    const isAlone = lines[lineIndex].length === 1;
    const target = lines[direction === 'up' ? lineIndex - 1 : lineIndex + 1];
    if (target === undefined)
        return isAlone
            ? sections
            : placeSection(sections, id, {
                  lineIndex: direction === 'up' ? 0 : lines.length,
              });
    return placeSection(sections, id, {
        overId: target[target.length - 1].id,
        side: 'after',
    });
};

/** The droppable id of the gap before the bar's section line `index` */
export const sectionLineTargetId = (index: number) => `section-line:${index}`;

/** The line index a section line target names, else null */
export const sectionLineIndexOf = (id: string): number | null => {
    const match = /^section-line:(\d+)$/.exec(id);
    return match ? Number(match[1]) : null;
};

/** The droppable id of the rail's header, which takes a filter out of its section */
export const UNSECTIONED_TARGET_ID = 'unsectioned-target';

/** The droppable id of the bar's space outside every capsule and pill */
export const BAR_SPACE_TARGET_ID = 'bar-space-target';

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

// The target is what is under the pointer; anywhere else a pointer is (the
// bar's empty space, beside or below the bar) is outside every section. The
// keyboard sensor has no pointer, so it falls back to the nearest centre
const underPointer: CollisionDetection = (args) => {
    const within = pointerWithin(args);
    const covered = within.filter(({ id }) => id !== BAR_SPACE_TARGET_ID);
    if (covered.length > 0) return covered;
    const barSpace = args.droppableContainers.find(
        ({ id }) => id === BAR_SPACE_TARGET_ID,
    );
    if (args.pointerCoordinates !== null && barSpace !== undefined)
        return [
            {
                id: BAR_SPACE_TARGET_ID,
                data: { droppableContainer: barSpace, value: 0 },
            },
        ];
    return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter(
            ({ id }) => id !== BAR_SPACE_TARGET_ID,
        ),
    });
};

// A dragged capsule lands only on another capsule, or a gap between section lines
export const SECTION_DRAG = 'section';
export const underPointerFor: CollisionDetection = (args) => {
    const isSectionDrag = args.active.data?.current?.kind === SECTION_DRAG;
    const droppableContainers = args.droppableContainers.filter((container) =>
        isSectionDrag
            ? container.data?.current?.kind === SECTION_DRAG
            : // The gaps between section lines take capsules only
              container.data?.current?.isLineGap !== true,
    );
    const pointer = args.pointerCoordinates;
    if (isSectionDrag && pointer !== null) {
        const within = pointerWithin({ ...args, droppableContainers });
        if (within.length > 0) return within;
        // A line's empty space lands beside that line's nearest capsule
        const nearest = droppableContainers
            .filter(({ data }) => data.current?.isLineGap !== true)
            .flatMap((container) => {
                const rect = args.droppableRects.get(container.id);
                if (
                    rect === undefined ||
                    pointer.y < rect.top ||
                    pointer.y > rect.bottom
                )
                    return [];
                const distance = Math.max(
                    rect.left - pointer.x,
                    pointer.x - rect.right,
                    0,
                );
                return [{ container, distance }];
            })
            .sort((a, b) => a.distance - b.distance)[0];
        if (nearest !== undefined)
            return [
                {
                    id: nearest.container.id,
                    data: {
                        droppableContainer: nearest.container,
                        value: nearest.distance,
                    },
                },
            ];
    }
    return underPointer({ ...args, droppableContainers });
};
