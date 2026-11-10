import { uniqBy } from 'es-toolkit/compat';
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

/** A file's slug, else derived from the field; repeats follow `getPortableSlugs` */
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
        return groups.flat().map(({ rule, group }) => ({
            kind: DashboardControlRefKind.FILTER,
            id: rule.id,
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
 * followed by its members, in `controlOrder` order with its line starts;
 * membership comes from `sectionId`. Dangling, duplicate and
 * unknown-kind refs are dropped, unmentioned controls trail their container
 * in the default order (dimension filters, metric filters, parameter
 * controls, then sections) on the line before them. With no list, every
 * section starts a line.
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
    // A line start on a dropped ref or a section member passes to the next bar control
    let pendingLine = false;
    const mentioned = order.flatMap((ref) => {
        if (typeof ref !== 'object' || ref === null) return [];
        const newLine = pendingLine || ref.newLine === true;
        const key =
            isKnownKind(ref.kind) && typeof ref.id === 'string'
                ? refKey(ref.kind, ref.id)
                : undefined;
        const control = key === undefined ? undefined : byKey.get(key);
        if (key === undefined || control === undefined || seen.has(key)) {
            pendingLine = newLine;
            return [];
        }
        seen.add(key);
        pendingLine = control.sectionId !== null && newLine;
        return [{ control, newLine: control.sectionId === null && newLine }];
    });
    const placed = new Set(mentioned.map(({ control }) => control));
    const hasList = mentioned.length > 0;
    const unmentioned = controls
        .filter((control) => !placed.has(control))
        .map((control) => ({
            control,
            newLine:
                !hasList && control.kind === DashboardControlRefKind.SECTION,
        }));
    const sequence = [...mentioned, ...unmentioned];

    const containerOf = (sectionId: string | null) =>
        sequence
            .filter(({ control }) => control.sectionId === sectionId)
            .map(({ control, newLine }) => ({
                ...control,
                newLine: sectionId === null && newLine,
            }));

    return containerOf(null).flatMap((control) =>
        control.kind === DashboardControlRefKind.SECTION
            ? [control, ...containerOf(control.id)]
            : [control],
    );
};
