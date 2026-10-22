import {
    ChartType,
    type ChartConfig,
    type CreateSavedChartVersion,
    type ReplaceCustomFields,
    type SkippedReplaceCustomFields,
} from '../types/savedCharts';
import { type VizTableConfig } from '../visualizations/types';
import { getItemId } from './item';

export function maybeReplaceFieldsInChartVersion({
    fieldsToReplace,
    chartVersion,
}: {
    fieldsToReplace: ReplaceCustomFields[string];
    chartVersion: CreateSavedChartVersion;
}): {
    hasChanges: boolean;
    chartVersion: CreateSavedChartVersion;
    skippedFields: SkippedReplaceCustomFields[string];
} {
    let hasChanges = false;
    const skippedFields: SkippedReplaceCustomFields[string] = {
        customMetrics: {},
    };
    const newChartData: CreateSavedChartVersion = { ...chartVersion };

    // Replace custom metrics
    const customMetricsToReplace = Object.entries(
        fieldsToReplace.customMetrics,
    );
    customMetricsToReplace.forEach(([customMetricToReplace, replaceWith]) => {
        if (customMetricToReplace === replaceWith.replaceWithFieldId) {
            const foundCustomMetric =
                !!chartVersion.metricQuery.additionalMetrics?.find(
                    (additionalMetric) =>
                        getItemId(additionalMetric) === customMetricToReplace,
                );
            if (foundCustomMetric) {
                hasChanges = true;
                // remove custom metric
                newChartData.metricQuery.additionalMetrics =
                    newChartData.metricQuery.additionalMetrics?.filter(
                        (additionalMetric) =>
                            getItemId(additionalMetric) !==
                            customMetricToReplace,
                    );
            } else {
                skippedFields.customMetrics[customMetricToReplace] = {
                    reason: `Custom metric ${customMetricToReplace} not found in chart version.`,
                    replaceWithFieldId: replaceWith.replaceWithFieldId,
                };
            }
        } else {
            skippedFields.customMetrics[customMetricToReplace] = {
                reason: 'Replacing custom metrics with a metric with a different ID is not supported yet.',
                replaceWithFieldId: replaceWith.replaceWithFieldId,
            };
        }
    });

    return {
        hasChanges,
        skippedFields,
        chartVersion: newChartData || chartVersion,
    };
}

/**
 * Extracts custom labels from a VizTableConfig columns configuration.
 * Returns a record mapping field references to their custom labels,
 * but only for fields where the label differs from the reference.
 */
export function getCustomLabelsFromVizTableConfig(
    config: VizTableConfig | undefined,
): Record<string, string> {
    if (!config?.columns) return {};

    return Object.fromEntries(
        Object.entries(config.columns)
            .filter(
                ([_, columnConfig]) =>
                    columnConfig.label !== columnConfig.reference,
            )
            .map(([key, columnConfig]) => [key, columnConfig.label]),
    );
}

/**
 * Extracts hidden field references from a VizTableConfig columns configuration.
 * Returns an array of field references that are marked as not visible.
 */
export function getHiddenFieldsFromVizTableConfig(
    config: VizTableConfig | undefined,
): string[] {
    if (!config?.columns) return [];

    return Object.entries(config.columns)
        .filter(([_, columnConfig]) => !columnConfig.visible)
        .map(([key]) => key);
}

/**
 * Extracts column order from a VizTableConfig columns configuration.
 * Returns an array of field references sorted by their order property.
 */
export function getColumnOrderFromVizTableConfig(
    config: VizTableConfig | undefined,
): string[] {
    if (!config?.columns) return [];
    // If none of the columns have an empty property, return an empty list
    // for sql queries, we will order the columns based on the results
    if (
        Object.values(config.columns).every(
            (column) => column.order === undefined,
        )
    ) {
        return [];
    }

    return Object.entries(config.columns)
        .sort(([_, a], [__, b]) => (a.order ?? 0) - (b.order ?? 0))
        .map(([key]) => key);
}

/**
 * Defaults for a chart being created from scratch (UI, API, content as code,
 * agents). Saved, duplicated and promoted charts keep their config untouched,
 * so a setting absent from older content keeps its original behaviour.
 *
 * TODO(2026-12-22): showIncompletePeriod shipped 2026-10-22. If nobody has
 * complained, treat a missing value as on for all charts (render default in
 * visualization's incomplete period check) and drop it from here.
 */
export const applyNewChartDefaults = (
    chartConfig: ChartConfig,
): ChartConfig => {
    if (
        chartConfig.type !== ChartType.CARTESIAN ||
        !chartConfig.config ||
        chartConfig.config.layout?.showIncompletePeriod !== undefined
    ) {
        return chartConfig;
    }
    return {
        ...chartConfig,
        config: {
            ...chartConfig.config,
            layout: {
                ...chartConfig.config.layout,
                showIncompletePeriod: true,
            },
        },
    };
};
