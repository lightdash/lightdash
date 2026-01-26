import {
    AdditionalMetric,
    CustomMetricBase,
    getFields,
    getItemId,
    type Explore,
} from '@lightdash/common';

/**
 * Populates SQL for a single custom metric from explore fields
 * This is needed because custom metrics are stored without SQL for security,
 * but we need to populate it from the explore when executing queries
 */
export function populateCustomMetricSQL(
    metric: CustomMetricBase | Omit<AdditionalMetric, 'sql'>,
    explore: Explore,
): AdditionalMetric | null {
    const exploreFields = getFields(explore);

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
        return null;
    }

    return {
        ...metric,
        sql: dimensionField.sql,
    };
}

/**
 * Populates SQL for custom metrics from explore fields
 * This is needed because custom metrics are stored without SQL for security,
 * but we need to populate it from the explore when executing queries
 */
export function populateCustomMetricsSQL(
    customMetrics:
        | (CustomMetricBase | Omit<AdditionalMetric, 'sql'>)[]
        | null
        | undefined,
    explore: Explore,
): AdditionalMetric[] {
    if (!customMetrics || customMetrics.length === 0) {
        return [];
    }

    return customMetrics.reduce<AdditionalMetric[]>((acc, metric) => {
        const populatedMetric = populateCustomMetricSQL(metric, explore);
        if (populatedMetric) {
            acc.push(populatedMetric);
        }
        return acc;
    }, []);
}
