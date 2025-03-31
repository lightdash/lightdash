import { type Explore } from '../types/explore';
import {
    type CompiledDimension,
    type CompiledField,
    type CompiledMetric,
    type CustomDimension,
    type Dimension,
    type ItemsMap,
    type Metric,
    type TableCalculation,
} from '../types/field';
import { isDateFilterRule, type DateFilterSettings } from '../types/filter';
import { type AdditionalMetric, type MetricQuery } from '../types/metricQuery';
import {
    type ReplaceCustomFields,
    type ReplaceableCustomFields,
    type ReplaceableFieldMatchMap,
} from '../types/savedCharts';
import { convertAdditionalMetric } from './additionalMetrics';
import { getFormatExpression } from './formatting';
import { getItemId } from './item';

// Helper function to get a list of all dimensions in an explore
export const getDimensions = (explore: Explore): CompiledDimension[] =>
    Object.values(explore.tables).flatMap((t) => Object.values(t.dimensions));

// Helper function to get a list of all metrics in an explore
export const getMetrics = (explore: Explore): CompiledMetric[] =>
    Object.values(explore.tables).flatMap((t) => Object.values(t.metrics));

export const getFields = (explore: Explore): CompiledField[] => [
    ...getDimensions(explore),
    ...getMetrics(explore),
];

export const getFieldsFromMetricQuery = (
    metricQuery: MetricQuery,
    explore: Explore,
): ItemsMap => {
    const exploreFields = getFields(explore);
    const fields = [...metricQuery.dimensions, ...metricQuery.metrics].reduce<
        Record<string, Dimension | Metric>
    >((acc, metricField) => {
        const field = exploreFields.find((f) => metricField === getItemId(f));
        if (field) {
            return { ...acc, [metricField]: field };
        }
        return acc;
    }, {});
    const additionalMetrics = (metricQuery.additionalMetrics || [])
        .filter((cd) => metricQuery.metrics.includes(getItemId(cd)))
        .reduce<Record<string, Metric>>((acc, additionalMetric) => {
            const table = explore.tables[additionalMetric.table];
            if (table) {
                const metric = convertAdditionalMetric({
                    additionalMetric,
                    table,
                });
                return { ...acc, [getItemId(additionalMetric)]: metric };
            }
            return acc;
        }, {});
    const tableCalculations = metricQuery.tableCalculations.reduce<
        Record<string, TableCalculation>
    >(
        (acc, tableCalculation) => ({
            ...acc,
            [tableCalculation.name]: tableCalculation,
        }),
        {},
    );
    const customDimensions = metricQuery.customDimensions
        ?.filter((cd) => metricQuery.dimensions.includes(getItemId(cd)))
        .reduce<Record<string, CustomDimension>>(
            (acc, customDimension) => ({
                ...acc,
                [getItemId(customDimension)]: customDimension,
            }),
            {},
        );
    return {
        ...fields,
        ...tableCalculations,
        ...customDimensions,
        ...additionalMetrics,
    };
};

export function compareMetricAndCustomMetric({
    metric,
    customMetric,
}: {
    metric: Metric;
    customMetric: AdditionalMetric;
}) {
    const conditions = {
        fieldIdMatch: {
            isMatch: getItemId(metric) === getItemId(customMetric),
            requiredForSuggestion: false,
        },
        labelMatch: {
            isMatch: metric.label === customMetric.label,
            requiredForSuggestion: false,
        },
        sqlMatch: {
            isMatch: metric.sql === customMetric.sql,
            requiredForSuggestion: true,
        },
        baseDimensionMatch: {
            isMatch:
                metric.dimensionReference ===
                `${customMetric.table}_${customMetric.baseDimensionName}`,
            requiredForSuggestion: true,
        },
        metricTypeMatch: {
            isMatch: metric.type === customMetric.type,
            requiredForSuggestion: true,
        },
        formatMatch: {
            isMatch:
                getFormatExpression(metric) ===
                getFormatExpression(customMetric),
            requiredForSuggestion: true,
        },
        percentileMatch: {
            isMatch: metric.percentile === customMetric.percentile,
            requiredForSuggestion: true,
        },
        filtersMatch: {
            isMatch:
                (customMetric.filters || []).length ===
                    (metric.filters || []).length &&
                (metric.filters || []).every((filter) =>
                    customMetric.filters?.find((customFilter) => {
                        const fieldRefMatch =
                            customFilter.target.fieldRef ===
                            filter.target.fieldRef;
                        const operatorMatch =
                            customFilter.operator === filter.operator;
                        const valuesMatch =
                            customFilter.values === filter.values ||
                            customFilter.values?.every((value) =>
                                filter.values?.includes(value),
                            );
                        let settingsMatch =
                            isDateFilterRule(customFilter) ===
                            isDateFilterRule(filter);
                        if (
                            isDateFilterRule(customFilter) &&
                            isDateFilterRule(filter)
                        ) {
                            const metricSettings =
                                filter.settings as DateFilterSettings;
                            const customMetricSettings =
                                customFilter.settings as DateFilterSettings;
                            settingsMatch =
                                metricSettings.unitOfTime ===
                                customMetricSettings.unitOfTime;
                        }
                        return (
                            fieldRefMatch &&
                            operatorMatch &&
                            valuesMatch &&
                            settingsMatch
                        );
                    }),
                ),
            requiredForSuggestion: true,
        },
    };

    const isExactMatch = Object.values(conditions).every(
        (condition) => condition.isMatch,
    );
    const isSuggestedMatch = Object.values(conditions)
        .filter((condition) => condition.requiredForSuggestion)
        .every((condition) => condition.isMatch);

    return {
        isExactMatch,
        isSuggestedMatch,
    };
}

export function findReplaceableCustomMetrics({
    customMetrics,
    metrics,
}: {
    customMetrics: AdditionalMetric[];
    metrics: Metric[];
}): ReplaceableFieldMatchMap {
    return customMetrics.reduce<ReplaceableFieldMatchMap>(
        (acc, customMetric) => {
            let match: ReplaceableFieldMatchMap[string]['match'] = null;
            const suggestedMatches: ReplaceableFieldMatchMap[string]['suggestedMatches'] =
                [];
            metrics.forEach((metric) => {
                const fieldId = getItemId(metric);
                const fieldLabel = metric.label;
                const { isExactMatch, isSuggestedMatch } =
                    compareMetricAndCustomMetric({
                        metric,
                        customMetric,
                    });

                if (isExactMatch) {
                    match = {
                        fieldId,
                        fieldLabel,
                    };
                } else if (isSuggestedMatch) {
                    suggestedMatches.push({
                        fieldId,
                        fieldLabel,
                    });
                }
            });
            if (match !== null || suggestedMatches.length > 0) {
                return {
                    ...acc,
                    [getItemId(customMetric)]: {
                        fieldId: customMetric.name,
                        label: customMetric.label || customMetric.name,
                        match,
                        suggestedMatches,
                    },
                };
            }
            return acc;
        },
        {},
    );
}

export function convertReplaceableFieldMatchMapToReplaceFieldsMap(
    replaceableFieldMap: ReplaceableFieldMatchMap,
): ReplaceCustomFields[string]['customMetrics'] {
    return Object.entries(replaceableFieldMap).reduce<
        ReplaceCustomFields[string]['customMetrics']
    >((acc2, [customFieldId, customField]) => {
        if (customField.match) {
            return {
                ...acc2,
                [customFieldId]: {
                    replaceWithFieldId: customField.match.fieldId,
                },
            };
        }
        return acc2;
    }, {});
}

// todo: rename+breakdown this util and all the replace/replaceable types to be more descriptive
export function convertReplaceableFieldMatchMapToReplaceCustomFields(
    replaceableCustomFields: ReplaceableCustomFields,
): ReplaceCustomFields {
    return Object.entries(replaceableCustomFields).reduce<ReplaceCustomFields>(
        (acc, [chartUuid, customFields]) => {
            const customMetrics =
                convertReplaceableFieldMatchMapToReplaceFieldsMap(
                    customFields.customMetrics,
                );
            if (Object.keys(customMetrics).length > 0) {
                acc[chartUuid] = {
                    customMetrics,
                };
            }
            return acc;
        },
        {},
    );
}
