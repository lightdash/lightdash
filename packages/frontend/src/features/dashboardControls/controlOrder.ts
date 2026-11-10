import {
    DashboardControlRefKind,
    type DashboardControlRef,
    type DashboardControlSection,
    type DashboardParameterControl,
} from '@lightdash/common';
import { sortBy } from 'es-toolkit/compat';

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
): T[] => {
    const changed = after.filter((control) => {
        const was = before.find(({ id }) => id === control.id);
        return was !== undefined && was.sectionId !== control.sectionId;
    });
    // Leavers each go right after the section: placed last first, they keep their order
    return [
        ...changed.filter(({ sectionId }) => sectionId !== null),
        ...changed.filter(({ sectionId }) => sectionId === null).reverse(),
    ].reduce(
        (list, control) =>
            placeControl(list, control.id, { sectionId: control.sectionId }),
        before,
    );
};

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
