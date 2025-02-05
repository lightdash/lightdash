import {
    type CreateSavedChartVersion,
    type ReplaceCustomFields,
    type SkippedReplaceCustomFields,
} from '../types/savedCharts';
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
