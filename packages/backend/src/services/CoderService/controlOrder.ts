import {
    assertUnreachable,
    DashboardControlRefKind,
    getDashboardFilterSlugs,
    ParameterError,
    reconcileDashboardControlOrder,
    type DashboardControlRef,
    type DashboardControlRefAsCode,
    type DashboardControlSectionAsCode,
    type DashboardControlSources,
    type DashboardFilterRule,
    type DashboardFilterRuleAsCode,
    type DashboardParameterControlAsCode,
} from '@lightdash/common';
import { controlSlugs } from './parameterControlSlugs';
import { sectionSlugs } from './sectionSlugs';

type OrderedControls = Omit<DashboardControlSources, 'controlOrder'>;

const ORDERABLE_KINDS = [
    DashboardControlRefKind.FILTER,
    DashboardControlRefKind.PARAMETER,
    DashboardControlRefKind.SECTION,
] as const;

type OrderableKind = (typeof ORDERABLE_KINDS)[number];

const getFilterRules = ({
    filters,
}: OrderedControls): DashboardFilterRule[] => [
    ...filters.dimensions,
    ...filters.metrics,
];

type ControlSlugs = Record<OrderableKind, { id: string; slug: string }[]>;

const withIds = (controls: { id: string }[], slugs: string[]) =>
    controls.map(({ id }, index) => ({ id, slug: slugs[index] }));

/** Each dimension then metric filter's slug, derived as a download writes them */
export const getFilterSlugsAsCode = (controls: OrderedControls): string[] =>
    getDashboardFilterSlugs(
        getFilterRules(controls).map(({ target }) => ({ target })),
    );

// Derived on every download: stored slugs are ignored
const getDerivedControlSlugs = (controls: OrderedControls): ControlSlugs => ({
    [DashboardControlRefKind.FILTER]: withIds(
        getFilterRules(controls),
        getFilterSlugsAsCode(controls),
    ),
    [DashboardControlRefKind.PARAMETER]: withIds(
        controls.parameterControls,
        controlSlugs(
            controls.parameterControls.map(({ label, parameters }) => ({
                label,
                parameters,
            })),
        ),
    ),
    [DashboardControlRefKind.SECTION]: withIds(
        controls.sections,
        sectionSlugs(controls.sections.map(({ name }) => ({ name }))),
    ),
});

/** Rejects malformed or repeated filter slugs in a file, so a ref never picks one of two filters */
export const assertValidFilterSlugs = (
    filters: Pick<DashboardFilterRuleAsCode, 'slug'>[],
): void => {
    const seen = new Set<string>();
    filters.forEach(({ slug }) => {
        if (slug === undefined) return;
        if (
            typeof slug !== 'string' ||
            !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
        )
            throw new ParameterError(`Invalid dashboard filter slug "${slug}"`);
        if (seen.has(slug))
            throw new ParameterError(
                `Dashboard filter slug "${slug}" is duplicated`,
            );
        seen.add(slug);
    });
};

/** The slugs an uploaded file's refs use (its own, else derived), with the ids its controls resolved to */
export const getUploadedControlSlugs = (
    file: {
        filters: Pick<DashboardFilterRuleAsCode, 'target' | 'slug'>[];
        parameterControls: DashboardParameterControlAsCode[];
        sections: Pick<DashboardControlSectionAsCode, 'name' | 'slug'>[];
    },
    uploaded: OrderedControls,
): ControlSlugs => ({
    [DashboardControlRefKind.FILTER]: withIds(
        getFilterRules(uploaded),
        getDashboardFilterSlugs(file.filters),
    ),
    [DashboardControlRefKind.PARAMETER]: withIds(
        uploaded.parameterControls,
        controlSlugs(file.parameterControls),
    ),
    [DashboardControlRefKind.SECTION]: withIds(
        uploaded.sections,
        sectionSlugs(file.sections),
    ),
});

/** The reconciled order as file refs, using the slugs the same file writes */
export const getControlOrderAsCode = (
    sources: DashboardControlSources,
): DashboardControlRefAsCode[] => {
    const slugs = getDerivedControlSlugs(sources);
    const slugOf = (kind: OrderableKind, id: string) =>
        slugs[kind].find((control) => control.id === id)?.slug;
    return reconcileDashboardControlOrder(sources).flatMap(
        (control): DashboardControlRefAsCode[] => {
            switch (control.kind) {
                case DashboardControlRefKind.FILTER:
                case DashboardControlRefKind.PARAMETER:
                case DashboardControlRefKind.SECTION: {
                    const slug = slugOf(control.kind, control.id);
                    if (slug === undefined) return [];
                    return [
                        {
                            kind: control.kind,
                            slug,
                            ...(control.newLine && { newLine: true }),
                        },
                    ];
                }
                case DashboardControlRefKind.DATE_ZOOM:
                    return [];
                default:
                    return assertUnreachable(
                        control,
                        'Unknown dashboard control',
                    );
            }
        },
    );
};

type ControlIds = Record<
    DashboardControlRefKind.FILTER | DashboardControlRefKind.SECTION,
    string[]
>;

/** With the flag off the stored order is kept; refs to ids an upload re-minted move to the new ids of their kind, since refs are per-kind slots */
export const withReplacedIds = (
    order: DashboardControlRef[] | undefined,
    before: ControlIds,
    after: ControlIds,
): DashboardControlRef[] | undefined => {
    if (!Array.isArray(order)) return order;
    const replacements = new Map<string, string>();
    (Object.keys(before) as (keyof ControlIds)[]).forEach((kind) => {
        const added = after[kind].filter((id) => !before[kind].includes(id));
        order
            .filter((ref) => ref.kind === kind && !after[kind].includes(ref.id))
            .forEach((ref, index) => {
                if (index < added.length)
                    replacements.set(`${kind}:${ref.id}`, added[index]);
            });
    });
    return order.map((ref) => {
        const id = replacements.get(`${ref.kind}:${ref.id}`);
        return id === undefined ? ref : { ...ref, id };
    });
};

const isOrderableKind = (kind: unknown): kind is OrderableKind =>
    ORDERABLE_KINDS.includes(kind as OrderableKind);

/** Translates a file's control order to control ids, rejecting refs that resolve to nothing in the file */
export const getControlOrderWithIds = (
    controlOrder: unknown,
    slugs: ControlSlugs,
): DashboardControlRef[] => {
    const validSlugs = ORDERABLE_KINDS.map(
        (kind) =>
            `${kind}: ${slugs[kind].map(({ slug }) => slug).join(', ') || 'none'}`,
    ).join('; ');
    const reject = (message: string): never => {
        throw new ParameterError(
            `${message} in controlOrder. Valid slugs are ${validSlugs}`,
        );
    };
    if (!Array.isArray(controlOrder)) reject('Expected a list');
    const seen = new Set<string>();
    return (controlOrder as unknown[]).map((ref) => {
        if (typeof ref !== 'object' || ref === null)
            return reject(`Invalid entry ${JSON.stringify(ref)}`);
        const { kind, slug, newLine } = ref as Record<string, unknown>;
        if (kind === DashboardControlRefKind.DATE_ZOOM)
            return reject('Date zoom controls cannot be ordered yet');
        if (!isOrderableKind(kind) || typeof slug !== 'string')
            return reject(`Invalid entry ${JSON.stringify(ref)}`);
        if (newLine !== undefined && typeof newLine !== 'boolean')
            return reject(`Invalid newLine on the ${kind} "${slug}"`);
        const control = slugs[kind].find((item) => item.slug === slug);
        if (control === undefined)
            return reject(`Unknown ${kind} slug "${slug}"`);
        const key = `${kind}:${slug}`;
        if (seen.has(key))
            return reject(`The ${kind} "${slug}" appears more than once`);
        seen.add(key);
        // A section member's line start passes to the next bar control, so keep it
        return {
            kind,
            id: control.id,
            ...(newLine === true && { newLine: true }),
        };
    });
};
