import {
    getPortableSlugs,
    ParameterError,
    type DashboardAsCode,
    type DashboardConfig,
    type DashboardConfigAsCode,
    type DashboardControlSection,
    type DashboardControlSectionAsCode,
    type DashboardFilterRuleAsCode,
    type DashboardParameterControlAsCode,
    type DateZoomControlAsCode,
} from '@lightdash/common';
import { pick } from 'es-toolkit/compat';
import { v4 as uuidv4 } from 'uuid';
import { getStableIds } from './dashboardReferences';

type SectionReference = { sectionId?: string; sectionSlug?: string };
type WithSectionReference<T> = T & SectionReference;
type DashboardWithSections<Section> = Omit<
    DashboardAsCode,
    'config' | 'filters'
> & {
    filters?: {
        dimensions?: WithSectionReference<
            Omit<DashboardFilterRuleAsCode, 'id'>
        >[];
        metrics?: WithSectionReference<DashboardFilterRuleAsCode>[];
        tableCalculations?: WithSectionReference<DashboardFilterRuleAsCode>[];
    };
    config?: Omit<
        DashboardConfigAsCode,
        'controlSections' | 'parameterControls' | 'dateZoomConfig'
    > & {
        controlSections?: Section[];
        parameterControls?: WithSectionReference<DashboardParameterControlAsCode>[];
        dateZoomConfig?: Omit<
            NonNullable<DashboardConfigAsCode['dateZoomConfig']>,
            'controls'
        > & { controls: WithSectionReference<DateZoomControlAsCode>[] };
    };
};
/** A dashboard file whose references hold stored section ids */
export type DashboardWithSectionIds =
    DashboardWithSections<DashboardControlSection>;

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

const mapReferences = <Section>(
    dashboard: DashboardWithSections<Section>,
    sectionOf: (reference: SectionReference) => SectionReference,
): DashboardWithSections<Section> => {
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

/** Flag on: references become the slugs derived from the section names */
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
        mapReferences(dashboard, ({ sectionId }) => {
            const slug =
                sectionId === undefined ? undefined : slugById.get(sectionId);
            return slug === undefined ? {} : { sectionSlug: slug };
        }),
        (section, index) => ({
            ...pick(section, ['name', 'collapsed']),
            slug: slugs[index],
        }),
    );
};

/** Flag off: the stored shape, without the section ids a file never holds */
export const getDashboardWithoutSectionIds = (
    dashboard: DashboardWithSectionIds,
): DashboardAsCode =>
    withSections(
        mapReferences(dashboard, () => ({})),
        (section) => pick(section, ['slug', 'name', 'collapsed']),
    );

export const getDashboardWithSectionIds = (
    dashboard: DashboardAsCode,
    existing: DashboardConfig | undefined,
    controlsEnabled: boolean,
): DashboardWithSectionIds => {
    const sections = dashboard.config?.controlSections ?? [];
    const existingSections = existing?.controlSections ?? [];
    const stableIds = controlsEnabled
        ? getStableIds(sections, existingSections, sectionBase)
        : [];
    // Flag off keeps the legacy match on stored slugs and persists the slug
    const existingSlugs = sectionSlugs(existingSections);
    const existingBySlug = new Map(
        existingSections.map((section, index) => [
            existingSlugs[index],
            section.id,
        ]),
    );
    const slugs = sectionSlugs(sections);
    const idBySlug = new Map<string, string>();
    const resolved = sections.map(({ slug, ...section }, index) => {
        if (slug !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
            throw new ParameterError(
                `Invalid dashboard section slug "${slug}"`,
            );
        if (idBySlug.has(slugs[index]))
            throw new ParameterError(
                `Dashboard section slug "${slugs[index]}" is duplicated`,
            );
        const id = controlsEnabled
            ? stableIds[index]
            : (existingBySlug.get(slugs[index]) ?? uuidv4());
        idBySlug.set(slugs[index], id);
        if (controlsEnabled) return { ...section, id };
        const savedSlug =
            slug ?? existingSections.find((item) => item.id === id)?.slug;
        return {
            ...section,
            id,
            ...(savedSlug !== undefined && { slug: savedSlug }),
        };
    });
    const converted = mapReferences(dashboard, ({ sectionSlug }) => {
        if (sectionSlug === undefined) return {};
        const id = idBySlug.get(sectionSlug);
        if (id === undefined)
            throw new ParameterError(
                `Unknown dashboard section slug "${sectionSlug}"`,
            );
        return { sectionId: id };
    });
    if (!converted.config) {
        const { config: _config, ...withoutConfig } = converted;
        return withoutConfig;
    }
    const { controlSections: _sections, ...config } = converted.config;
    return {
        ...converted,
        config: {
            ...config,
            ...(dashboard.config?.controlSections !== undefined && {
                controlSections: resolved,
            }),
        },
    };
};
