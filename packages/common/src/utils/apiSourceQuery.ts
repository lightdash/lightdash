import {
    type ApiSourceExplore,
    type ApiSourceFieldRule,
} from '../types/apiSourceExplore';
import { type FieldId } from '../types/field';
import {
    flattenFilterGroup,
    isAndFilterGroup,
    isFilterGroup,
    type FilterGroup,
} from '../types/filter';
import { type MetricQuery } from '../types/metricQuery';

/** Why a metric query can't run on a live data source explore, with what to change. */
export type ApiSourceQueryIssue = {
    fieldId: FieldId | null;
    message: string;
};

const getFieldRule = (
    apiSource: ApiSourceExplore,
    fieldId: FieldId,
): ApiSourceFieldRule | undefined =>
    Object.hasOwn(apiSource.fields, fieldId)
        ? apiSource.fields[fieldId]
        : undefined;

const getFilterFieldIds = (metricQuery: MetricQuery): FieldId[] =>
    [metricQuery.filters.dimensions, metricQuery.filters.metrics].flatMap(
        (group) =>
            group
                ? flattenFilterGroup(group).map((rule) => rule.target.fieldId)
                : [],
    );

const getUnsupportedFeatureIssues = (
    metricQuery: MetricQuery,
): ApiSourceQueryIssue[] => {
    const tableCalculationFilters = metricQuery.filters.tableCalculations
        ? flattenFilterGroup(metricQuery.filters.tableCalculations)
        : [];
    const features = [
        {
            isUsed: metricQuery.tableCalculations.length > 0,
            name: 'Table calculations',
        },
        {
            isUsed: tableCalculationFilters.length > 0,
            name: 'Table calculation filters',
        },
        {
            isUsed: (metricQuery.additionalMetrics ?? []).length > 0,
            name: 'Custom metrics',
        },
        {
            isUsed: (metricQuery.customDimensions ?? []).length > 0,
            name: 'Custom dimensions',
        },
    ];
    return features
        .filter(({ isUsed }) => isUsed)
        .map(({ name }) => ({
            fieldId: null,
            message: `${name} can't run on live data sources yet. Remove them from the query.`,
        }));
};

const getUnknownFieldIssues = (
    apiSource: ApiSourceExplore,
    metricQuery: MetricQuery,
): ApiSourceQueryIssue[] => {
    const fieldIds = new Set([
        ...metricQuery.dimensions,
        ...metricQuery.metrics,
        ...metricQuery.sorts.map((sort) => sort.fieldId),
        ...getFilterFieldIds(metricQuery),
    ]);
    return [...fieldIds]
        .filter((fieldId) => !getFieldRule(apiSource, fieldId))
        .map((fieldId) => ({
            fieldId,
            message: `"${fieldId}" isn't available from this live data source.`,
        }));
};

const getFilterGroupShape = (
    group: FilterGroup,
    depth = 0,
): { usesOr: boolean; isNested: boolean } => {
    const items = (isAndFilterGroup(group) ? group.and : group.or) ?? [];
    const childShapes = items
        .filter(isFilterGroup)
        .map((child) => getFilterGroupShape(child, depth + 1));
    return {
        usesOr:
            (!isAndFilterGroup(group) && items.length > 1) ||
            childShapes.some((shape) => shape.usesOr),
        isNested: depth > 0 || childShapes.some((shape) => shape.isNested),
    };
};

const getFilterIssues = (
    apiSource: ApiSourceExplore,
    group: FilterGroup | undefined,
): ApiSourceQueryIssue[] => {
    if (!group) {
        return [];
    }
    const shape = getFilterGroupShape(group);
    const shapeIssues = [
        ...(shape.usesOr && !apiSource.filterGroups.or
            ? [
                  {
                      fieldId: null,
                      message:
                          'This live data source only combines filters with AND. Replace the OR group with separate queries.',
                  },
              ]
            : []),
        ...(shape.isNested && !apiSource.filterGroups.nested
            ? [
                  {
                      fieldId: null,
                      message:
                          "This live data source can't nest filter groups. Put every filter in one group.",
                  },
              ]
            : []),
    ];
    const ruleIssues = flattenFilterGroup(group)
        .filter((rule) => !rule.disabled)
        .flatMap((rule) => {
            const { fieldId } = rule.target;
            const fieldRule = getFieldRule(apiSource, fieldId);
            if (
                !fieldRule ||
                fieldRule.filterOperators.includes(rule.operator)
            ) {
                return [];
            }
            return [
                {
                    fieldId,
                    message:
                        fieldRule.filterOperators.length === 0
                            ? `"${fieldId}" can't be filtered on this live data source.`
                            : `"${fieldId}" can't be filtered with "${rule.operator}". Use one of: ${fieldRule.filterOperators.join(', ')}.`,
                },
            ];
        });
    return [...shapeIssues, ...ruleIssues];
};

const getIncompatibilityIssues = (
    apiSource: ApiSourceExplore,
    metricQuery: MetricQuery,
): ApiSourceQueryIssue[] => {
    const used = new Set([
        ...metricQuery.dimensions,
        ...metricQuery.metrics,
        ...getFilterFieldIds(metricQuery),
    ]);
    return apiSource.incompatible.flatMap((incompatibility) => {
        const field = incompatibility.fields.find((id) => used.has(id));
        const other = incompatibility.with.find((id) => used.has(id));
        if (!field || !other) {
            return [];
        }
        return [
            {
                fieldId: field,
                message: `"${field}" can't be combined with "${other}": ${incompatibility.reason}`,
            },
        ];
    });
};

const getSizeIssues = (
    apiSource: ApiSourceExplore,
    metricQuery: MetricQuery,
): ApiSourceQueryIssue[] => {
    const limits = [
        {
            count: metricQuery.dimensions.length,
            max: apiSource.maxDimensions,
            noun: 'dimensions',
        },
        {
            count: metricQuery.metrics.length,
            max: apiSource.maxMetrics,
            noun: 'metrics',
        },
    ];
    return limits
        .filter(({ count, max }) => max !== null && count > max)
        .map(({ count, max, noun }) => ({
            fieldId: null,
            message: `This live data source allows at most ${max} ${noun} per query; this one has ${count}.`,
        }));
};

/** Every reason the API behind `apiSource` can't answer `metricQuery`; empty when it can. */
export const getApiSourceQueryIssues = (
    apiSource: ApiSourceExplore,
    metricQuery: MetricQuery,
): ApiSourceQueryIssue[] => [
    ...getUnsupportedFeatureIssues(metricQuery),
    ...getUnknownFieldIssues(apiSource, metricQuery),
    ...getFilterIssues(apiSource, metricQuery.filters.dimensions),
    ...getFilterIssues(apiSource, metricQuery.filters.metrics),
    ...getIncompatibilityIssues(apiSource, metricQuery),
    ...getSizeIssues(apiSource, metricQuery),
];
