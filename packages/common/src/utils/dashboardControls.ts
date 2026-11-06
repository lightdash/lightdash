import { groupBy, uniqBy } from 'es-toolkit/compat';
import {
    DashboardControlRefKind,
    type DashboardControlRef,
    type DashboardControlSection,
    type DashboardParameterControl,
    type DateZoomControl,
} from '../types/dashboard';
import {
    type DashboardFilterRule,
    type DashboardFilters,
} from '../types/filter';
import assertUnreachable from './assertUnreachable';
import { getPortableSlugs } from './portableSlugs';

export type DashboardControlKind = DashboardControlRefKind;

export type DashboardFilterControlGroup = 'dimensions' | 'metrics';

type DashboardControlPayloads = {
    [DashboardControlRefKind.FILTER]: {
        rule: DashboardFilterRule;
        group: DashboardFilterControlGroup;
    };
    [DashboardControlRefKind.PARAMETER]: { control: DashboardParameterControl };
    [DashboardControlRefKind.DATE_ZOOM]: { control: DateZoomControl };
    [DashboardControlRefKind.SECTION]: { section: DashboardControlSection };
};

/** One control on the bar, derived from where its data lives; never stored */
export type DashboardControl<
    K extends DashboardControlKind = DashboardControlKind,
> = {
    [P in K]: {
        kind: P;
        id: string;
        slug: string | null;
        /** The section it renders in: a dangling id is null, a section's own is null */
        sectionId: string | null;
        label: string | null;
        hidden: boolean;
    } & DashboardControlPayloads[P];
}[K];

/** A control placed on the bar: `newLine` when it starts a bar line, always false inside a section */
export type OrderedDashboardControl = DashboardControl & { newLine: boolean };

export type DashboardControlSources = {
    controlOrder: DashboardControlRef[] | undefined;
    filters: Pick<DashboardFilters, 'dimensions' | 'metrics'>;
    parameterControls: DashboardParameterControl[];
    sections: DashboardControlSection[];
};

type Adapter<K extends DashboardControlKind> = (
    sources: DashboardControlSources,
    sectionOf: (sectionId: string | undefined) => string | null,
) => DashboardControl<K>[];

const FILTER_GROUPS: DashboardFilterControlGroup[] = ['dimensions', 'metrics'];

/** Stored slug, else derived from the field; repeats follow `getPortableSlugs` */
export const getDashboardFilterSlugs = (
    rules: { slug?: string; target: { fieldId: string } }[],
): string[] =>
    getPortableSlugs(
        rules,
        ({ target }) =>
            target.fieldId
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '') || 'filter',
    );

const adapters: { [K in DashboardControlKind]: Adapter<K> } = {
    [DashboardControlRefKind.FILTER]: ({ filters }, sectionOf) => {
        const groups = FILTER_GROUPS.map((group) =>
            filters[group].map((rule) => ({ rule, group })),
        );
        const all = groups.flat();
        const slugs = getDashboardFilterSlugs(all.map(({ rule }) => rule));
        return all.map(({ rule, group }, index) => ({
            kind: DashboardControlRefKind.FILTER,
            id: rule.id,
            slug: slugs[index],
            sectionId: sectionOf(rule.sectionId),
            label: rule.label ?? null,
            hidden: false,
            rule,
            group,
        }));
    },
    [DashboardControlRefKind.PARAMETER]: ({ parameterControls }, sectionOf) =>
        parameterControls.map((control) => ({
            kind: DashboardControlRefKind.PARAMETER,
            id: control.id,
            slug: control.slug ?? null,
            sectionId: sectionOf(control.sectionId),
            label: control.label,
            hidden: control.hidden ?? false,
            control,
        })),
    // Date zoom controls don't join the shared order yet
    [DashboardControlRefKind.DATE_ZOOM]: () => [],
    // A repeated section id would expand its members twice
    [DashboardControlRefKind.SECTION]: ({ sections }) =>
        uniqBy(sections, 'id').map((section) => ({
            kind: DashboardControlRefKind.SECTION,
            id: section.id,
            slug: section.slug ?? null,
            sectionId: null,
            label: section.name,
            hidden: false,
            section,
        })),
};

// Declaration order is the default order of kinds
const KINDS: DashboardControlKind[] = Object.values(DashboardControlRefKind);

const isKnownKind = (kind: unknown): kind is DashboardControlKind =>
    KINDS.includes(kind as DashboardControlKind);

const refKey = (kind: DashboardControlKind, id: string) => `${kind}:${id}`;

// Slots a kind's array refills; dimension and metric filters refill separately
const slotOf = (control: DashboardControl): string => {
    switch (control.kind) {
        case DashboardControlRefKind.FILTER:
            return `${control.kind}:${control.group}`;
        case DashboardControlRefKind.PARAMETER:
        case DashboardControlRefKind.DATE_ZOOM:
        case DashboardControlRefKind.SECTION:
            return control.kind;
        default:
            return assertUnreachable(control, 'Unknown dashboard control');
    }
};

/** Shape check for a stored or incoming order; unknown kinds pass, readers ignore them */
export const isDashboardControlOrder = (
    value: unknown,
): value is DashboardControlRef[] =>
    Array.isArray(value) &&
    value.every((ref: unknown) => {
        if (typeof ref !== 'object' || ref === null) return false;
        const { kind, id, newLine } = ref as Record<string, unknown>;
        return (
            typeof kind === 'string' &&
            typeof id === 'string' &&
            (newLine === undefined || typeof newLine === 'boolean')
        );
    });

export const getDashboardControls = (
    sources: DashboardControlSources,
): DashboardControl[] => {
    const sectionIds = new Set(sources.sections.map(({ id }) => id));
    const sectionOf = (sectionId: string | undefined) =>
        sectionId !== undefined && sectionIds.has(sectionId) ? sectionId : null;
    return KINDS.flatMap((kind): DashboardControl[] => {
        switch (kind) {
            case DashboardControlRefKind.FILTER:
                return adapters[kind](sources, sectionOf);
            case DashboardControlRefKind.PARAMETER:
                return adapters[kind](sources, sectionOf);
            case DashboardControlRefKind.DATE_ZOOM:
                return adapters[kind](sources, sectionOf);
            case DashboardControlRefKind.SECTION:
                return adapters[kind](sources, sectionOf);
            default:
                return assertUnreachable(kind, 'Unknown dashboard control');
        }
    });
};

/**
 * The bar's controls in order: unsectioned controls, with each section
 * followed by its members. `controlOrder` only decides how kinds interleave,
 * where sections sit and where bar lines start; each kind's array orders that
 * kind, and membership comes from `sectionId`. Dangling, duplicate and
 * unknown-kind refs are dropped, unmentioned controls trail their container
 * in the default order (dimension filters, metric filters, parameter
 * controls, then sections) on the line before them. With no list, lines
 * follow the sections' `inline`: the first section and every section not
 * `inline` start a line.
 */
export const reconcileDashboardControlOrder = (
    sources: DashboardControlSources,
): OrderedDashboardControl[] => {
    const controls = getDashboardControls(sources);
    const byKey = new Map(
        controls.map((control) => [refKey(control.kind, control.id), control]),
    );
    const seen = new Set<string>();
    const order = Array.isArray(sources.controlOrder)
        ? sources.controlOrder
        : [];
    const mentioned = order.flatMap((ref) => {
        if (
            typeof ref !== 'object' ||
            ref === null ||
            !isKnownKind(ref.kind) ||
            typeof ref.id !== 'string'
        )
            return [];
        const key = refKey(ref.kind, ref.id);
        const control = byKey.get(key);
        if (control === undefined || seen.has(key)) return [];
        seen.add(key);
        return [{ control, newLine: ref.newLine === true }];
    });
    const placed = new Set(mentioned.map(({ control }) => control));
    const hasList = mentioned.length > 0;
    let sectionsSeen = 0;
    const unmentioned = controls
        .filter((control) => !placed.has(control))
        .map((control) => {
            if (hasList || control.kind !== DashboardControlRefKind.SECTION)
                return { control, newLine: false };
            sectionsSeen += 1;
            return {
                control,
                newLine: sectionsSeen === 1 || control.section.inline !== true,
            };
        });
    const sequence = [...mentioned, ...unmentioned];

    // Each container's slots, refilled per kind from that kind's array order;
    // a line start stays with its slot
    const containerOf = (sectionId: string | null) => {
        const isIn = (control: DashboardControl) =>
            control.sectionId === sectionId;
        const queues = groupBy(controls.filter(isIn), slotOf);
        return sequence
            .filter(({ control }) => isIn(control))
            .map(({ control, newLine }) => ({
                ...queues[slotOf(control)].shift()!,
                newLine: sectionId === null && newLine,
            }));
    };

    return containerOf(null).flatMap((control) =>
        control.kind === DashboardControlRefKind.SECTION
            ? [control, ...containerOf(control.id)]
            : [control],
    );
};
