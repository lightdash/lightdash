import {
    getPortableSlugs,
    ParameterError,
    type DashboardAsCode,
    type DashboardConfig,
    type DashboardControlSection,
    type DashboardControlSectionAsCode,
    type DashboardFilterRuleAsCode,
    type DashboardParameterControlAsCode,
    type DashboardUploadAsCode,
} from '@lightdash/common';
import { pick } from 'es-toolkit/compat';
import { v4 as uuidv4 } from 'uuid';
import { getStableIds } from './dashboardReferences';

type SectionReference = { sectionId?: string; sectionSlug?: string };
type WithSectionReference<T> = T & SectionReference;
type DashboardWithSections<
    Section,
    File extends DashboardUploadAsCode = DashboardAsCode,
> = Omit<File, 'config' | 'filters'> & {
    filters?: {
        dimensions?: WithSectionReference<
            Omit<DashboardFilterRuleAsCode, 'id'>
        >[];
        metrics?: WithSectionReference<DashboardFilterRuleAsCode>[];
        tableCalculations?: WithSectionReference<DashboardFilterRuleAsCode>[];
    };
    config?: Omit<
        NonNullable<File['config']>,
        'controlSections' | 'parameterControls' | 'dateZoomConfig'
    > & {
        controlSections?: Section[];
        parameterControls?: WithSectionReference<DashboardParameterControlAsCode>[];
        dateZoomConfig?: Omit<
            NonNullable<NonNullable<File['config']>['dateZoomConfig']>,
            'controls'
        > & {
            controls: WithSectionReference<
                NonNullable<
                    NonNullable<File['config']>['dateZoomConfig']
                >['controls'][number]
            >[];
        };
    };
};
/** A dashboard file whose references hold stored section ids */
export type DashboardWithSectionIds<
    File extends DashboardUploadAsCode = DashboardAsCode,
> = DashboardWithSections<DashboardControlSection, File>;

/** A saved config without the order's ids, nor `parameterSections` that earlier versions saved */
export const withoutStoredOnlyKeys = ({
    controlOrder: _order,
    parameterSections: _sections,
    ...config
}: DashboardConfig & { parameterSections?: unknown }) => config;

const sectionBase = ({ name }: Pick<DashboardControlSection, 'name'>) =>
    name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'section';

/** A file's slug, else derived from the name */
export const sectionSlugs = (
    sections: Pick<DashboardControlSectionAsCode, 'name' | 'slug'>[],
) => getPortableSlugs(sections, sectionBase);

const mapReferences = <Section, File extends DashboardUploadAsCode>(
    dashboard: DashboardWithSections<Section, File>,
    sectionOf: (reference: SectionReference) => SectionReference,
): DashboardWithSections<Section, File> => {
    const mapReference = <T extends SectionReference>({
        sectionId,
        sectionSlug,
        ...reference
    }: T) => ({
        ...reference,
        ...sectionOf({ sectionId, sectionSlug }),
    });
    return {
        ...dashboard,
        ...(dashboard.filters && {
            filters: {
                ...dashboard.filters,
                ...(dashboard.filters.dimensions && {
                    dimensions: dashboard.filters.dimensions.map(mapReference),
                }),
                ...(dashboard.filters.metrics && {
                    metrics: dashboard.filters.metrics.map(mapReference),
                }),
                ...(dashboard.filters.tableCalculations && {
                    tableCalculations:
                        dashboard.filters.tableCalculations.map(mapReference),
                }),
            },
        }),
        ...(dashboard.config && {
            config: {
                ...dashboard.config,
                ...(dashboard.config.parameterControls && {
                    parameterControls:
                        dashboard.config.parameterControls.map(mapReference),
                }),
                ...(dashboard.config.dateZoomConfig && {
                    dateZoomConfig: {
                        ...dashboard.config.dateZoomConfig,
                        controls:
                            dashboard.config.dateZoomConfig.controls.map(
                                mapReference,
                            ),
                    },
                }),
            },
        }),
    };
};

// Saved sections can carry keys nothing reads any more, such as `inline`
const withSections = (
    dashboard: DashboardWithSectionIds,
    toFile: (
        section: DashboardControlSection,
        index: number,
    ) => DashboardControlSectionAsCode,
): DashboardAsCode =>
    dashboard.config?.controlSections
        ? {
              ...dashboard,
              config: {
                  ...dashboard.config,
                  controlSections: dashboard.config.controlSections.map(toFile),
              },
          }
        : dashboard;

/** References become the slugs derived from the section names */
export const getDashboardWithSectionSlugs = (
    dashboard: DashboardWithSectionIds,
): DashboardAsCode => {
    const sections = dashboard.config?.controlSections ?? [];
    // Derived on every download: a stored slug is ignored
    const slugs = sectionSlugs(sections.map(({ name }) => ({ name })));
    const slugById = new Map(
        sections.map((section, index) => [section.id, slugs[index]]),
    );
    return withSections(
        mapReferences<DashboardControlSection, DashboardAsCode>(
            dashboard,
            ({ sectionId }) => {
                const slug =
                    sectionId === undefined
                        ? undefined
                        : slugById.get(sectionId);
                return slug === undefined ? {} : { sectionSlug: slug };
            },
        ),
        (section, index) => ({
            ...pick(section, ['name', 'collapsed']),
            slug: slugs[index],
        }),
    );
};

export const getDashboardWithSectionIds = <File extends DashboardUploadAsCode>(
    dashboard: File,
    existing: DashboardConfig | undefined,
    controlsEnabled: boolean,
): DashboardWithSectionIds<File> => {
    const sections = dashboard.config?.controlSections ?? [];
    const existingSections = existing?.controlSections ?? [];
    const stableIds = controlsEnabled
        ? getStableIds(sections, existingSections, sectionBase)
        : [];
    const storedSlugs = sectionSlugs(existingSections);
    const nameSlugs = sectionSlugs(
        existingSections.map(({ name }) => ({ name })),
    );
    const byStoredSlug = new Map(
        existingSections.map(({ id }, index) => [storedSlugs[index], id]),
    );
    const byNameSlug = new Map(
        existingSections.map(({ id }, index) => [nameSlugs[index], id]),
    );
    const slugs = sectionSlugs(sections);
    // Flag off: stored slugs, then name slugs, each saved id once; whole-file passes so file order never decides
    const namedIds = new Set(slugs.map((fileSlug) => byNameSlug.get(fileSlug)));
    const matched = new Map<string, string>();
    const claim = (matchOf: (fileSlug: string) => string | undefined) =>
        slugs.forEach((fileSlug) => {
            const id = matchOf(fileSlug);
            if (
                matched.has(fileSlug) ||
                id === undefined ||
                [...matched.values()].includes(id)
            )
                return;
            matched.set(fileSlug, id);
        });
    if (!controlsEnabled) {
        claim((fileSlug) => {
            const stored = byStoredSlug.get(fileSlug);
            return stored === byNameSlug.get(fileSlug) || !namedIds.has(stored)
                ? stored
                : undefined;
        });
        claim((fileSlug) => byNameSlug.get(fileSlug));
        claim((fileSlug) => byStoredSlug.get(fileSlug));
    }
    const idBySlug = new Map<string, string>();
    const resolved = sections.map(({ slug, ...section }, index) => {
        if (slug !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
            throw new ParameterError(
                `Invalid dashboard section slug "${slug}"; use lowercase letters and digits, with single hyphens between them`,
            );
        if (idBySlug.has(slugs[index]))
            throw new ParameterError(
                `Dashboard section slug "${slugs[index]}" is used by sections ${slugs.indexOf(slugs[index]) + 1} ("${sections[slugs.indexOf(slugs[index])].name}") and ${index + 1} ("${section.name}") in config.controlSections; give each a unique slug`,
            );
        const id = controlsEnabled
            ? stableIds[index]
            : (matched.get(slugs[index]) ?? uuidv4());
        idBySlug.set(slugs[index], id);
        const kept = { ...pick(section, ['name', 'collapsed']), id };
        if (controlsEnabled) return kept;
        const savedSlug =
            slug ?? existingSections.find((item) => item.id === id)?.slug;
        return {
            ...kept,
            ...(savedSlug !== undefined && { slug: savedSlug }),
        };
    });
    const converted = mapReferences(dashboard, ({ sectionSlug }) => {
        if (sectionSlug === undefined) return {};
        const id = idBySlug.get(sectionSlug);
        if (id === undefined)
            throw new ParameterError(
                `Unknown dashboard section slug "${sectionSlug}". Valid section slugs are ${[...idBySlug.keys()].join(', ') || 'none; add the section under config.controlSections'}`,
            );
        return { sectionId: id };
    });
    if (!converted.config) {
        const { config: _config, ...withoutConfig } = converted;
        return withoutConfig as DashboardWithSectionIds<File>;
    }
    // Keys earlier versions accepted; nothing reads them, so an upload drops them
    const {
        controlSections: _sections,
        parameterSections: _parameterSections,
        parameterSectionSlugs: _parameterSectionSlugs,
        ...config
    } = converted.config as typeof converted.config & {
        parameterSections?: unknown;
        parameterSectionSlugs?: unknown;
    };
    return {
        ...converted,
        config: {
            ...config,
            ...(dashboard.config?.controlSections !== undefined && {
                controlSections: resolved,
            }),
        },
    } as DashboardWithSectionIds<File>;
};
