import {
    AdditionalMetric,
    CustomMetricBase,
    extractFieldNameFromFieldId,
    getFields,
    getItemId,
    resolveFieldIdFromBaseDimension,
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
    if (!metric.baseDimensionName) {
        return null;
    }

    const exploreFields = getFields(explore);

    const fieldId = resolveFieldIdFromBaseDimension(
        metric.baseDimensionName,
        metric.table,
        exploreFields,
    );

    const dimensionField = exploreFields.find(
        (field) => getItemId(field) === fieldId,
    );

    if (!dimensionField) {
        return null;
    }

    // Convert fieldId to field name for query engine
    const baseDimensionName = extractFieldNameFromFieldId(
        metric.baseDimensionName,
        metric.table,
    );

    return {
        ...metric,
        baseDimensionName,
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
