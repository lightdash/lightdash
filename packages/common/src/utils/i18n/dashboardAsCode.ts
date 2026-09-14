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

const getFilterLabels = (
    filters: DashboardAsCode['filters'],
): DashboardFilterLabelTranslations | undefined => {
    const labels = [
        ...(filters?.dimensions ?? []),
        ...(filters?.metrics ?? []),
        ...(filters?.tableCalculations ?? []),
    ]
        .map((rule) => rule.label)
        .filter(
            (label): label is string =>
                typeof label === 'string' && label.length > 0,
        );
    return labels.length > 0
        ? Object.fromEntries(labels.map((label) => [label, label]))
        : undefined;
};

type DashboardLanguageMapEntry = PartialDeep<
    Omit<DashboardAsCode, 'filters'>,
    { recurseIntoArrays: true }
> & {
    filters: { labels: DashboardFilterLabelTranslations } | undefined;
};

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
        const { filters: filterOverrides, ...contentOverrides } =
            internalizationMap;
        const merged = mergeExisting(
            content,
            contentOverrides,
        ) as DashboardAsCode;
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
