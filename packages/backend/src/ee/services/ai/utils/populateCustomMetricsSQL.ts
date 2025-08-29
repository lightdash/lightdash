import {
    AdditionalMetric,
    CustomMetricBaseSchema,
    getFields,
    getItemId,
    type Explore,
} from '@lightdash/common';

/**
 * Populates SQL for custom metrics from explore fields
 * This is needed because custom metrics are stored without SQL for security,
 * but we need to populate it from the explore when executing queries
 */
export function populateCustomMetricsSQL(
    customMetrics:
        | (CustomMetricBaseSchema | AdditionalMetric)[]
        | null
        | undefined,
    explore: Explore,
): AdditionalMetric[] {
    if (!customMetrics || customMetrics.length === 0) {
        return [];
    }

    const exploreFields = getFields(explore);

    return customMetrics.reduce<AdditionalMetric[]>((acc, metric) => {
        // Find the dimension field to get its SQL
        const dimensionField = exploreFields.find(
            (field) =>
                metric.baseDimensionName &&
                getItemId(field) ===
                    getItemId({
                        table: metric.table,
                        name: metric.baseDimensionName,
                    }),
        );

        if (!dimensionField) {
            return acc;
        }
        return [
            ...acc,
            {
                ...metric,
                sql: dimensionField.sql,
            },
        ];
    }, []);
}
