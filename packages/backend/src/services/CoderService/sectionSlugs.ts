import {
    ParameterError,
    type DashboardAsCode,
    type DashboardConfig,
    type DashboardControlSection,
    type DashboardControlSectionAsCode,
} from '@lightdash/common';
import { v4 as uuidv4 } from 'uuid';
import { getPortableSlugs } from './portableSlugs';

type SectionReference = { sectionId?: string; sectionSlug?: string };
type DashboardWithSectionIds = Omit<DashboardAsCode, 'config'> & {
    config?: Omit<NonNullable<DashboardAsCode['config']>, 'controlSections'> & {
        controlSections?: DashboardControlSection[];
    };
};

const sectionSlugs = (sections: DashboardControlSectionAsCode[]) =>
    getPortableSlugs(
        sections,
        (section) =>
            section.name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '') || 'section',
    );

const mapReferences = (
    dashboard: DashboardAsCode,
    sectionOf: (reference: SectionReference) => SectionReference,
): DashboardAsCode => {
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

export const getDashboardWithSectionSlugs = (
    dashboard: DashboardAsCode,
): DashboardAsCode => {
    const sections = dashboard.config?.controlSections;
    if (!sections) return dashboard;
    const slugs = sectionSlugs(sections);
    const slugById = new Map(
        sections.map((section, index) => [section.id, slugs[index]]),
    );
    const converted = mapReferences(
        dashboard,
        ({ sectionId, sectionSlug: _slug, ...reference }) => {
            const slug =
                sectionId === undefined ? undefined : slugById.get(sectionId);
            return {
                ...reference,
                ...(slug !== undefined && { sectionSlug: slug }),
            };
        },
    );
    const { parameterSections, ...config } = converted.config!;
    return {
        ...converted,
        config: {
            ...config,
            controlSections: sections.map(
                ({ id: _id, slug: _slug, ...section }, index) => ({
                    ...section,
                    slug: slugs[index],
                }),
            ),
            ...(parameterSections && {
                parameterSectionSlugs: Object.fromEntries(
                    Object.entries(parameterSections).flatMap(([key, id]) => {
                        const slug = slugById.get(id);
                        return slug === undefined ? [] : [[key, slug]];
                    }),
                ),
            }),
        },
    };
};

export const getDashboardWithSectionIds = (
    dashboard: DashboardAsCode,
    existing: DashboardConfig | undefined,
): DashboardWithSectionIds => {
    const sections = dashboard.config?.controlSections ?? [];
    const existingSections = existing?.controlSections ?? [];
    const existingSlugs = sectionSlugs(existingSections);
    const existingBySlug = new Map(
        existingSections.map((section, index) => [
            existingSlugs[index],
            section.id,
        ]),
    );
    const ids = new Set<string>();
    const idBySlug = new Map<string, string>();
    const resolved = sections.map(({ id, slug, ...section }) => {
        if (slug !== undefined) {
            if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
                throw new ParameterError(
                    `Invalid dashboard section slug "${slug}"`,
                );
            if (idBySlug.has(slug))
                throw new ParameterError(
                    `Dashboard section slug "${slug}" is duplicated`,
                );
        }
        const matchedId =
            slug === undefined ? undefined : existingBySlug.get(slug);
        if (id !== undefined && matchedId !== undefined && id !== matchedId)
            throw new ParameterError(
                `Dashboard section slug "${slug}" conflicts with id "${id}"`,
            );
        if (id === '' || (slug === undefined && id === undefined))
            throw new ParameterError(
                'A dashboard section needs a slug or legacy id',
            );
        const resolvedId = matchedId ?? id ?? uuidv4();
        if (ids.has(resolvedId))
            throw new ParameterError(
                `Dashboard section id "${resolvedId}" is duplicated`,
            );
        ids.add(resolvedId);
        if (slug !== undefined) idBySlug.set(slug, resolvedId);
        const savedSlug =
            slug ??
            existingSections.find((item) => item.id === resolvedId)?.slug;
        return {
            ...section,
            id: resolvedId,
            ...(savedSlug !== undefined && { slug: savedSlug }),
        };
    });
    const resolveSlug = (slug: string): string => {
        const id = idBySlug.get(slug);
        if (id === undefined)
            throw new ParameterError(
                `Unknown dashboard section slug "${slug}"`,
            );
        return id;
    };
    const converted = mapReferences(
        dashboard,
        ({ sectionId, sectionSlug, ...reference }) => {
            const id =
                sectionSlug === undefined
                    ? sectionId
                    : resolveSlug(sectionSlug);
            if (
                sectionSlug !== undefined &&
                sectionId !== undefined &&
                id !== sectionId
            )
                throw new ParameterError(
                    `Dashboard section slug "${sectionSlug}" conflicts with id "${sectionId}"`,
                );
            return { ...reference, ...(id !== undefined && { sectionId: id }) };
        },
    );
    if (!converted.config) {
        const { config: _config, ...withoutConfig } = converted;
        return withoutConfig;
    }
    const {
        parameterSectionSlugs,
        controlSections: _sections,
        ...config
    } = converted.config;
    const parameterSections = { ...config.parameterSections };
    Object.entries(parameterSectionSlugs ?? {}).forEach(([key, slug]) => {
        const id = resolveSlug(slug);
        if (
            parameterSections[key] !== undefined &&
            parameterSections[key] !== id
        )
            throw new ParameterError(
                `Conflicting section references for parameter "${key}"`,
            );
        parameterSections[key] = id;
    });
    return {
        ...converted,
        config: {
            ...config,
            ...(dashboard.config?.controlSections !== undefined && {
                controlSections: resolved,
            }),
            ...((config.parameterSections !== undefined ||
                parameterSectionSlugs !== undefined) && { parameterSections }),
        },
    };
};
