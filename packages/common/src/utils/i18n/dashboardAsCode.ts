import { omit } from 'es-toolkit/compat';
import { type PartialDeep } from 'type-fest';
import { z } from 'zod';
import { type DashboardAsCode } from '../../types/coder';
import { DashboardTileTypes } from '../../types/dashboard';
import { AsCodeInternalization } from './abstract';
import { mergeExisting } from './merge';

const dashboardAsCodeSchema = z.object({
    name: z.string(),
    description: z
        .string()
        .nullable()
        .optional()
        .transform((str) => str ?? undefined),
    tabs: z.array(
        z.object({
            name: z.string(),
        }),
    ),
    tiles: z.array(
        z.union([
            z.object({
                type: z.union([
                    z.literal(DashboardTileTypes.SAVED_CHART),
                    z.literal(DashboardTileTypes.SQL_CHART),
                ]),
                properties: z.object({
                    title: z.string(),
                    chartName: z.string().optional().default(''),
                }),
            }),
            z.object({
                type: z.literal(DashboardTileTypes.MARKDOWN),
                properties: z.object({
                    title: z.string(),
                    content: z.string(),
                }),
            }),
            z.object({
                type: z.literal(DashboardTileTypes.LOOM),
                properties: z.object({
                    title: z.string(),
                }),
            }),
            z.object({
                type: z.literal(DashboardTileTypes.HEADING),
                properties: z.object({
                    text: z.string(),
                }),
            }),
            z.object({
                type: z.literal(DashboardTileTypes.DATA_APP),
                properties: z.object({
                    title: z.string(),
                }),
            }),
        ]),
    ),
});

/**
 * Source (untranslated) filter label -> translated label. Keyed by label
 * rather than array position so translations survive filter reordering,
 * insertion, and deletion; renaming a label invalidates its translation
 * (the pill falls back to the source label). Deliberately an
 * index-signature literal, not `Record` — see DashboardTileTargets.
 */
export type DashboardFilterLabelTranslations = {
    [sourceLabel: string]: string;
};

export const getFilterLabelTranslation = (
    labels: DashboardFilterLabelTranslations,
    sourceLabel: string | undefined,
): string | undefined => {
    if (!sourceLabel) return undefined;
    const translated = labels[sourceLabel];
    return typeof translated === 'string' && translated.length > 0
        ? translated
        : undefined;
};

export const translateFilterRuleLabels = <
    T extends { label: string | undefined },
>(
    rules: T[],
    labels: DashboardFilterLabelTranslations,
): T[] =>
    rules.map((rule) => {
        const translated = getFilterLabelTranslation(labels, rule.label);
        return translated ? { ...rule, label: translated } : rule;
    });

const getSourceNames = (
    names: (string | null | undefined)[],
): DashboardFilterLabelTranslations | undefined => {
    const sourceNames = names.filter(
        (name): name is string => typeof name === 'string' && name.length > 0,
    );
    return sourceNames.length > 0
        ? Object.fromEntries(sourceNames.map((name) => [name, name]))
        : undefined;
};

const getFilterLabels = (
    filters: DashboardAsCode['filters'],
): DashboardFilterLabelTranslations | undefined =>
    getSourceNames(
        [
            ...(filters?.dimensions ?? []),
            ...(filters?.metrics ?? []),
            ...(filters?.tableCalculations ?? []),
        ].map((rule) => rule.label),
    );

/**
 * Source (untranslated) name -> translated name, as filter labels: two
 * controls with the same source name share one translation. Deliberately an
 * index-signature literal, not `Record` — see DashboardTileTargets.
 */
export type DashboardControlNameTranslations = {
    [sourceName: string]: string;
};

/** Control names of a dashboard's language map entry, each block present only when the dashboard has such controls */
export type DashboardControlTranslations = {
    sections?: { names: DashboardControlNameTranslations };
    /** A control's own label; one without takes its parameter's, translated by `LanguageMap.parameters` */
    parameterControls?: { labels: DashboardControlNameTranslations };
    dateZooms?: { names: DashboardControlNameTranslations };
};

type DashboardControlNamesConfig = {
    controlSections?: { name: string }[];
    parameterControls?: { label: string | null }[];
    dateZoomConfig?: { controls: { name: string }[] };
};

const getControlTranslations = (
    config: DashboardControlNamesConfig | undefined,
): DashboardControlTranslations => {
    const sectionNames = getSourceNames(
        (config?.controlSections ?? []).map(({ name }) => name),
    );
    const parameterControlLabels = getSourceNames(
        (config?.parameterControls ?? []).map(({ label }) => label),
    );
    const dateZoomNames = getSourceNames(
        (config?.dateZoomConfig?.controls ?? []).map(({ name }) => name),
    );
    return {
        ...(sectionNames && { sections: { names: sectionNames } }),
        ...(parameterControlLabels && {
            parameterControls: { labels: parameterControlLabels },
        }),
        ...(dateZoomNames && { dateZooms: { names: dateZoomNames } }),
    };
};

/**
 * Translates section names, parameter control labels and date zoom control
 * names by source name; a name without a translation is kept.
 */
export const translateDashboardControlNames = <
    T extends DashboardControlNamesConfig,
>(
    config: T,
    translations: DashboardControlTranslations,
): T => {
    const sectionNames = translations.sections?.names;
    const parameterControlLabels = translations.parameterControls?.labels;
    const dateZoomNames = translations.dateZooms?.names;
    const translated: DashboardControlNamesConfig = {
        ...(sectionNames &&
            config.controlSections && {
                controlSections: config.controlSections.map((section) => ({
                    ...section,
                    name:
                        getFilterLabelTranslation(sectionNames, section.name) ??
                        section.name,
                })),
            }),
        ...(parameterControlLabels &&
            config.parameterControls && {
                parameterControls: config.parameterControls.map((control) => ({
                    ...control,
                    label:
                        getFilterLabelTranslation(
                            parameterControlLabels,
                            control.label ?? undefined,
                        ) ?? control.label,
                })),
            }),
        ...(dateZoomNames &&
            config.dateZoomConfig && {
                dateZoomConfig: {
                    ...config.dateZoomConfig,
                    controls: config.dateZoomConfig.controls.map((control) => ({
                        ...control,
                        name:
                            getFilterLabelTranslation(
                                dateZoomNames,
                                control.name,
                            ) ?? control.name,
                    })),
                },
            }),
    };
    return Object.keys(translated).length > 0
        ? { ...config, ...translated }
        : config;
};

type DashboardLanguageMapEntry = PartialDeep<
    Omit<DashboardAsCode, 'filters' | 'config'>,
    { recurseIntoArrays: true }
> & {
    filters: { labels: DashboardFilterLabelTranslations } | undefined;
} & DashboardControlTranslations;

export class DashboardAsCodeInternalization extends AsCodeInternalization<
    {
        type: 'dashboard';
        content: DashboardAsCode;
    },
    typeof dashboardAsCodeSchema,
    DashboardLanguageMapEntry
> {
    constructor(protected schema = dashboardAsCodeSchema) {
        super();
    }

    public getLanguageMap(dashboardAsCode: DashboardAsCode) {
        const filterLabels = getFilterLabels(dashboardAsCode.filters);
        return {
            dashboard: {
                [dashboardAsCode.slug]: {
                    ...this.schema.partial().strip().parse(dashboardAsCode),
                    filters: filterLabels
                        ? { labels: filterLabels }
                        : undefined,
                    ...getControlTranslations(dashboardAsCode.config),
                },
            },
        };
    }

    // eslint-disable-next-line class-methods-use-this
    public merge(
        internalizationMap: ReturnType<
            this['getLanguageMap']
        >['dashboard'][string],
        content: DashboardAsCode,
    ) {
        const {
            filters: filterOverrides,
            sections,
            parameterControls,
            dateZooms,
            ...contentOverrides
        } = internalizationMap;
        // Older maps keyed section names by position under `config`: ignored
        const merged = mergeExisting(
            content,
            omit(contentOverrides, 'config'),
        ) as DashboardAsCode;
        if (merged.config) {
            merged.config = translateDashboardControlNames(merged.config, {
                sections,
                parameterControls,
                dateZooms,
            });
        }
        const labels = filterOverrides?.labels;
        if (labels && merged.filters) {
            merged.filters = {
                ...merged.filters,
                dimensions: translateFilterRuleLabels(
                    merged.filters.dimensions ?? [],
                    labels,
                ),
                metrics: translateFilterRuleLabels(
                    merged.filters.metrics ?? [],
                    labels,
                ),
                tableCalculations: translateFilterRuleLabels(
                    merged.filters.tableCalculations ?? [],
                    labels,
                ),
            };
        }
        return merged;
    }
}

export type DashboardAsCodeLanguageMap = ReturnType<
    DashboardAsCodeInternalization['getLanguageMap']
>;
