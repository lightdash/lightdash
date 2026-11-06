import {
    assertUnreachable,
    DashboardControlRefKind,
    getDashboardFilterSlugs,
    ParameterError,
    reconcileDashboardControlOrder,
    type DashboardControlRef,
    type DashboardControlRefAsCode,
    type DashboardControlSources,
    type DashboardFilterRule,
} from '@lightdash/common';
import { isEqual } from 'es-toolkit/compat';
import { getParameterControlsWithSlugs } from './parameterControlSlugs';
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

// The slugs a file uses for each control, by kind, in array order
const getControlSlugs = (
    controls: OrderedControls,
): Record<OrderableKind, { id: string; slug: string }[]> => {
    const rules = getFilterRules(controls);
    const filterSlugs = getDashboardFilterSlugs(rules);
    const parameterSlugs = getParameterControlsWithSlugs(
        controls.parameterControls,
    ).map(({ slug }) => slug!);
    const sectionSlugList = sectionSlugs(controls.sections);
    return {
        [DashboardControlRefKind.FILTER]: rules.map(({ id }, index) => ({
            id,
            slug: filterSlugs[index],
        })),
        [DashboardControlRefKind.PARAMETER]: controls.parameterControls.map(
            ({ id }, index) => ({
                id,
                slug: parameterSlugs[index],
            }),
        ),
        [DashboardControlRefKind.SECTION]: controls.sections.map(
            ({ id }, index) => ({
                id,
                slug: sectionSlugList[index],
            }),
        ),
    };
};

/** Each dimension then metric filter's slug, as a file with a control order writes them */
export const getFilterSlugsAsCode = (controls: OrderedControls): string[] =>
    getDashboardFilterSlugs(getFilterRules(controls));

/** The reconciled order as file refs, using the slugs the same file writes */
export const getControlOrderAsCode = (
    sources: DashboardControlSources,
): DashboardControlRefAsCode[] => {
    const slugs = getControlSlugs(sources);
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

const isOrderableKind = (kind: unknown): kind is OrderableKind =>
    ORDERABLE_KINDS.includes(kind as OrderableKind);

/** Translates a file's control order to control ids, rejecting refs that resolve to nothing in the file */
export const getControlOrderWithIds = (
    controlOrder: unknown,
    controls: OrderedControls,
): DashboardControlRef[] => {
    const slugs = getControlSlugs(controls);
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

/** Whether an order renders the same bar as no order: same controls, sections and line starts in the same places */
export const rendersDefaultControlOrder = (
    controlOrder: DashboardControlRef[],
    controls: OrderedControls,
): boolean => {
    const bar = (order: DashboardControlRef[] | undefined) =>
        reconcileDashboardControlOrder({
            ...controls,
            controlOrder: order,
        }).map(({ kind, id, sectionId, newLine }) => ({
            kind,
            id,
            sectionId,
            newLine,
        }));
    return isEqual(bar(controlOrder), bar(undefined));
};
