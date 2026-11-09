import {
    closestCenter,
    pointerWithin,
    type Announcements,
    type CollisionDetection,
    type Modifier,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import {
    DashboardControlRefKind,
    type DashboardControlRef,
    type DashboardControlSection,
    type DashboardParameterControl,
    type DashboardFilterRule,
    type DashboardFilters,
} from '@lightdash/common';
import { sortBy } from 'es-toolkit/compat';

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

/** A control on the bar, as `reconcileDashboardControlOrder` lists it */
export type BarControl = {
    kind: DashboardControlRefKind;
    id: string;
    sectionId: string | null;
    newLine: boolean;
};

/**
 * Where a moved control lands: beside another (its line and section; a
 * section never enters one), on a line of its own before the line that
 * `lineStartId` starts (null: after the last), last in a section, or out of
 * its section (null) right after it; a control outside every section ends the first line
 */
export type ControlPlacement =
    | { overId: string; side: 'before' | 'after' }
    | { lineStartId: string | null }
    | { sectionId: string | null }
    | { barStart: true };

const isSection = (control: BarControl) =>
    control.kind === DashboardControlRefKind.SECTION;

// The end of the control at `index`: a section's block takes its members
const blockEnd = (list: BarControl[], index: number) => {
    let end = index + 1;
    if (isSection(list[index]))
        while (list[end]?.sectionId === list[index].id) end += 1;
    return end;
};

const shapeOf = (list: BarControl[]) =>
    list
        .map(({ id, sectionId, newLine }) => `${id}:${sectionId}:${newLine}`)
        .join(',');

/** Puts the control `id` at `placement`; the same list when nothing moves */
export const placeControl = <T extends BarControl>(
    list: T[],
    id: string,
    placement: ControlPlacement,
): T[] => {
    const from = list.findIndex((control) => control.id === id);
    if (from === -1) return list;
    const mover = list[from];
    const end = blockEnd(list, from);
    const block = list.slice(from, end);
    const rest = [...list.slice(0, from), ...list.slice(end)];
    // A line start passes to the next control on the bar
    if (mover.sectionId === null && mover.newLine) {
        const next = rest.findIndex(
            (control, index) => index >= from && control.sectionId === null,
        );
        if (next !== -1) rest[next] = { ...rest[next], newLine: true };
    }
    let at: number;
    let sectionId: string | null = null;
    let newLine = false;
    if ('overId' in placement) {
        const overIndex = rest.findIndex(
            (control) => control.id === placement.overId,
        );
        if (overIndex === -1) return list;
        const over = rest[overIndex];
        if (isSection(mover) && over.sectionId !== null) return list;
        sectionId = over.sectionId;
        if (placement.side === 'before') {
            at = overIndex;
            // It takes the line's start when the control it goes before had it
            if (over.newLine) {
                newLine = true;
                rest[overIndex] = { ...over, newLine: false };
            }
        } else {
            at = blockEnd(rest, overIndex);
        }
    } else if ('barStart' in placement) {
        // Right after "Add filter", on its line
        at = 0;
    } else if ('lineStartId' in placement) {
        newLine = true;
        if (placement.lineStartId === null) {
            at = rest.length;
        } else {
            at = rest.findIndex(
                (control) => control.id === placement.lineStartId,
            );
            if (at === -1) return list;
        }
    } else if (placement.sectionId !== null) {
        if (isSection(mover)) return list;
        sectionId = placement.sectionId;
        const section = rest.findIndex(
            (control) => isSection(control) && control.id === sectionId,
        );
        if (section === -1) return list;
        at = blockEnd(rest, section);
    } else if (mover.sectionId !== null) {
        const section = rest.findIndex(
            (control) => isSection(control) && control.id === mover.sectionId,
        );
        if (section === -1) return list;
        at = blockEnd(rest, section);
    } else {
        const lineOne = rest.findIndex(
            (control) => control.sectionId === null && control.newLine,
        );
        at = lineOne === -1 ? rest.length : lineOne;
    }
    const next = [
        ...rest.slice(0, at),
        { ...mover, sectionId, newLine },
        ...block.slice(1),
        ...rest.slice(at),
    ];
    return shapeOf(next) === shapeOf(list) ? list : next;
};

/** The bar's lines of top-level controls; the first is "Add filter"'s, maybe empty */
const groupIntoBarLines = <T extends BarControl>(list: T[]): T[][] =>
    list
        .filter((control) => control.sectionId === null)
        .reduce<T[][]>(
            (lines, control) => {
                if (control.newLine) lines.push([control]);
                else lines[lines.length - 1].push(control);
                return lines;
            },
            [[]],
        );

/** The bar's lines as shown: a hidden line start keeps its line; the first line always shows */
export const getShownBarLines = <T extends BarControl>(
    list: T[],
    isShown: (control: T) => boolean,
): T[][] =>
    groupIntoBarLines(list)
        .map((line) => line.filter(isShown))
        .filter((line, index) => index === 0 || line.length > 0);

export type MoveDirection = 'left' | 'right' | 'up' | 'down';

/**
 * A keyboard move among the controls shown: Alt+Left/Right goes one place
 * along its container (the bar steps over a section, a section's members
 * stay in it); Alt+Up/Down joins the end of the line above or below, or at
 * the bottom takes a line of its own when it shares its line
 */
export const moveControlBy = <T extends BarControl>(
    list: T[],
    id: string,
    direction: MoveDirection,
    isShown: (control: T) => boolean,
): T[] => {
    const mover = list.find((control) => control.id === id);
    if (mover === undefined) return list;
    const isMoverOrShown = (control: T) =>
        control === mover || isShown(control);
    const peers = list.filter(
        (control) =>
            control.sectionId === mover.sectionId && isMoverOrShown(control),
    );
    if (direction === 'left' || direction === 'right') {
        const index = peers.indexOf(mover);
        const neighbour = peers[direction === 'left' ? index - 1 : index + 1];
        if (neighbour === undefined) return list;
        return placeControl(list, id, {
            overId: neighbour.id,
            side: direction === 'left' ? 'before' : 'after',
        });
    }
    if (mover.sectionId !== null) return list;
    const lines = getShownBarLines(list, isMoverOrShown);
    const lineIndex = lines.findIndex((line) => line.includes(mover));
    if (direction === 'up' && lineIndex === 0) return list;
    const target = lines[direction === 'up' ? lineIndex - 1 : lineIndex + 1];
    if (target === undefined)
        return lineIndex > 0 && lines[lineIndex].length === 1
            ? list
            : placeControl(list, id, { lineStartId: null });
    const last = target.at(-1);
    return last === undefined
        ? // The first line holds only "Add filter": it ends that line
          placeControl(list, id, { sectionId: null })
        : placeControl(list, id, { overId: last.id, side: 'after' });
};

/**
 * Every section change from `before` to `after` is a reorder: the control
 * goes last in its new section, or right after the section it left
 */
export const placeSectionChanges = <T extends BarControl>(
    before: T[],
    after: BarControl[],
): T[] =>
    after.reduce((list, control) => {
        const was = before.find(({ id }) => id === control.id);
        return was === undefined || was.sectionId === control.sectionId
            ? list
            : placeControl(list, control.id, { sectionId: control.sectionId });
    }, before);

/** The order as stored: every control, `newLine` only when true */
export const toControlRefs = (list: BarControl[]): DashboardControlRef[] =>
    list.map(({ kind, id, newLine }) =>
        newLine ? { kind, id, newLine } : { kind, id },
    );

/**
 * The stored order the bar follows: none when absent or empty; parameter
 * controls never saved (ids made per load) and not listed go before the
 * first section
 */
export const getEffectiveControlOrder = (
    order: DashboardControlRef[] | undefined,
    parameterControls: DashboardParameterControl[] | null,
    areParameterControlsSaved: boolean,
): DashboardControlRef[] | undefined => {
    if (order === undefined || order.length === 0) return undefined;
    if (areParameterControlsSaved || parameterControls === null) return order;
    // Only those it doesn't list: a reorder in this visit placed the rest
    const refs = parameterControls
        .filter(
            ({ id }) =>
                !order.some(
                    (ref) =>
                        ref.kind === DashboardControlRefKind.PARAMETER &&
                        ref.id === id,
                ),
        )
        .map(({ id }) => ({ kind: DashboardControlRefKind.PARAMETER, id }));
    if (refs.length === 0) return order;
    const at = order.findIndex(
        ({ kind }) => kind === DashboardControlRefKind.SECTION,
    );
    return at === -1
        ? [...order, ...refs]
        : [...order.slice(0, at), ...refs, ...order.slice(at)];
};

/** Items sorted to follow the order; unlisted ones keep their place at the end; the same array when unchanged */
export const followOrder = <T extends { id: string }>(
    items: T[],
    ids: string[],
): T[] => {
    const rank = new Map(ids.map((id, index) => [id, index]));
    const sorted = sortBy(items, (item) => rank.get(item.id) ?? ids.length);
    return sorted.every((item, index) => item === items[index])
        ? items
        : sorted;
};

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

/** The droppable id of the rail's header, which takes a filter out of its section */
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
