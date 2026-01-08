import { type Explore } from '../types/explore';
import {
    type CompiledDimension,
    type CompiledField,
    type CompiledMetric,
    type Metric,
} from '../types/field';
import { isDateFilterRule, type DateFilterSettings } from '../types/filter';
import { type AdditionalMetric } from '../types/metricQuery';
import type { ParametersValuesMap } from '../types/parameters';
import {
    type ReplaceCustomFields,
    type ReplaceableCustomFields,
    type ReplaceableFieldMatchMap,
} from '../types/savedCharts';
import { getFormatExpression } from './formatting';
import { getItemId } from './item';

// Helper function to get a list of all tables in an explore with valid parameters
const getTablesWithValidParameters = (
    explore: Explore,
    combinedParameters: ParametersValuesMap,
) => {
    const joinedTablesNames = explore.joinedTables.map((j) => j.table);
    const joinedTablesWithValidParameters = explore.joinedTables.reduce<
        string[]
    >((acc, join) => {
        const joinHasValidParameters =
            join.parameterReferences?.every(
                (paramRef) => combinedParameters[paramRef],
            ) ?? true;

        if (joinHasValidParameters) {
            acc.push(join.table);
        }

        return acc;
    }, []);

    const tablesWithValidParameters = Object.values(explore.tables).filter(
        (table) => {
            const tableHasValidParameters =
                table.parameterReferences?.every(
                    (paramRef) => combinedParameters[paramRef],
                ) ?? true;

            const tableIsJoined = joinedTablesNames.includes(table.name);
            const tableIsJoinedWithValidParameters =
                joinedTablesWithValidParameters.includes(table.name);

            if (tableIsJoined && !tableIsJoinedWithValidParameters) {
                return false;
            }

            return tableHasValidParameters;
        },
    );

    return tablesWithValidParameters;
};

// Helper function to get a list of all dimensions in an explore
/**
 * @deprecated Use `getDimensionMapFromTables` instead
 */
export const getDimensions = (explore: Explore): CompiledDimension[] =>
    Object.values(explore.tables).flatMap((t) => Object.values(t.dimensions));

export const getDimensionMapFromTables = (
    tables: Explore['tables'],
): Record<string, CompiledDimension> =>
    Object.values(tables).reduce<Record<string, CompiledDimension>>(
        (acc, table) => {
            Object.values(table.dimensions).forEach((dimension) => {
                acc[getItemId(dimension)] = dimension;
            });
            return acc;
        },
        {},
    );

export const getDimensionsWithValidParameters = (
    explore: Explore,
    combinedParameters: ParametersValuesMap,
): CompiledDimension[] =>
    getTablesWithValidParameters(explore, combinedParameters).flatMap((t) =>
        Object.values(t.dimensions).filter(
            (d) =>
                d.parameterReferences?.every((p) => combinedParameters[p]) ??
                true,
        ),
    );

// Helper function to get a list of all metrics in an explore
// @deprecated Use `getMetricsMapFromTables` instead
export const getMetrics = (explore: Explore): CompiledMetric[] =>
    Object.values(explore.tables).flatMap((t) => Object.values(t.metrics));

export const getMetricsMapFromTables = (
    tables: Explore['tables'],
): Record<string, CompiledMetric> =>
    Object.values(tables).reduce<Record<string, CompiledMetric>>(
        (acc, table) => {
            Object.values(table.metrics).forEach((metric) => {
                acc[getItemId(metric)] = metric;
            });
            return acc;
        },
        {},
    );

export const getMetricsWithValidParameters = (
    explore: Explore,
    combinedParameters: ParametersValuesMap,
): CompiledMetric[] =>
    getTablesWithValidParameters(explore, combinedParameters).flatMap((t) =>
        Object.values(t.metrics).filter(
            (m) =>
                m.parameterReferences?.every((p) => combinedParameters[p]) ??
                true,
        ),
    );

export const getFields = (explore: Explore): CompiledField[] => [
    ...getDimensions(explore),
    ...getMetrics(explore),
];

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
