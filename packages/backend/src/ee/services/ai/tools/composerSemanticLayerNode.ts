import {
    AiAgentValidatorError,
    buildPopAdditionalMetric,
    getCustomMetricType,
    getDimensions,
    getErrorMessage,
    getFields,
    getItemId,
    getMetrics,
    isFilterRule,
    isSupportedPeriodOverPeriodGranularity,
    MetricType,
    QuerySourceType,
    type AdditionalMetric,
    type Explore,
    type Filters,
    type MetricFilterRule,
    type ResolvedToolComposerQueryNode,
    type ToolComposerCustomMetric,
    type ToolComposerPeriodComparison,
    type ToolComposerQueryNode,
    type ToolComposerSemanticLayerNode,
} from '@lightdash/common';
import {
    formatFilterExpressionError,
    resolveExploreFilterExpressions,
} from '../utils/filterExpressions';
import { expandMetricsWithPopAdditionalMetrics } from '../utils/populateCustomMetricsSQL';

type ResolveOptions = {
    getExplore: (exploreName: string) => Explore;
};

type NodeProperty = 'filters' | 'customMetrics' | 'periodComparisons';

type Resolved<T> = { value: T; errors: string[] };

const describeErrors = (
    node: ToolComposerSemanticLayerNode,
    property: NodeProperty,
    errors: string[],
): string[] =>
    errors.length > 0
        ? [
              `Invalid ${property} on semanticLayer node "${node.nodeId}": ${errors.join(' ')}`,
          ]
        : [];

const MAX_LISTED_DIMENSIONS = 50;

const describeTableDimensions = (explore: Explore, table: string): string => {
    const ids = getDimensions(explore)
        .filter((dimension) => dimension.table === table && !dimension.hidden)
        .map(getItemId);
    if (!explore.tables[table])
        return `Explore "${explore.name}" has no table "${table}".`;
    if (ids.length === 0) return `Table "${table}" has no visible dimensions.`;
    const more =
        ids.length > MAX_LISTED_DIMENSIONS
            ? ` and ${ids.length - MAX_LISTED_DIMENSIONS} more`
            : '';
    return `Dimensions of "${table}": ${ids
        .slice(0, MAX_LISTED_DIMENSIONS)
        .join(', ')}${more}.`;
};

const toMetricFilters = (
    customMetricId: string,
    filter: string,
    explore: Explore,
): MetricFilterRule[] => {
    const result = resolveExploreFilterExpressions({
        filters: { dimensions: filter, metrics: null },
        explore,
        additionalMetrics: [],
    });
    if (!result.success) {
        throw new Error(
            `filter on "${customMetricId}": ${formatFilterExpressionError(result.error)}`,
        );
    }
    const group = result.data?.dimensions;
    if (!group) return [];
    const items = 'and' in group ? group.and : group.or;
    if ('or' in group && items.length > 1) {
        throw new Error(
            `filter on "${customMetricId}" combines rules with AND only.`,
        );
    }
    return items.filter(isFilterRule).map((rule, index) => {
        const dimension = getDimensions(explore).find(
            (field) => getItemId(field) === rule.target.fieldId,
        );
        if (!dimension) {
            throw new Error(
                `filter on "${customMetricId}" reads "${rule.target.fieldId}", which is not a dimension.`,
            );
        }
        return {
            id: `${customMetricId}_filter_${index}`,
            target: { fieldRef: `${dimension.table}.${dimension.name}` },
            operator: rule.operator,
            ...(rule.values !== undefined ? { values: rule.values } : {}),
            ...(rule.settings !== undefined ? { settings: rule.settings } : {}),
        };
    });
};

const toAdditionalMetric = (
    customMetric: ToolComposerCustomMetric,
    explore: Explore,
): AdditionalMetric => {
    const id = getItemId(customMetric);
    const dimension = getDimensions(explore).find(
        (field) =>
            getItemId(field) === customMetric.dimensionFieldId &&
            field.table === customMetric.table,
    );
    if (!dimension) {
        throw new Error(
            `"${customMetric.dimensionFieldId}" is not a dimension of table "${customMetric.table}". ${describeTableDimensions(explore, customMetric.table)}`,
        );
    }
    if (
        !getCustomMetricType(dimension.type).includes(customMetric.aggregation)
    ) {
        throw new Error(
            `${customMetric.aggregation} cannot aggregate the ${dimension.type} dimension "${customMetric.dimensionFieldId}"; use one of ${getCustomMetricType(dimension.type).join(', ')}.`,
        );
    }
    const isPercentile = customMetric.aggregation === MetricType.PERCENTILE;
    const percentile = customMetric.percentile ?? null;
    if (isPercentile && percentile === null) {
        throw new Error(
            `"${id}" needs a percentile: set "percentile" (0–100).`,
        );
    }
    if (!isPercentile && percentile !== null) {
        throw new Error(
            `"${id}": "percentile" applies only to the percentile aggregation; set it to null.`,
        );
    }
    const filters = customMetric.filter
        ? toMetricFilters(id, customMetric.filter, explore)
        : [];
    return {
        table: customMetric.table,
        name: customMetric.name,
        label: customMetric.label,
        ...(customMetric.description != null
            ? { description: customMetric.description }
            : {}),
        type: customMetric.aggregation,
        sql: dimension.sql,
        baseDimensionName: dimension.name,
        ...(percentile !== null ? { percentile } : {}),
        ...(filters.length > 0 ? { filters } : {}),
    };
};

const toAdditionalMetrics = (
    node: ToolComposerSemanticLayerNode,
    explore: Explore,
): Resolved<AdditionalMetric[]> => {
    const exploreFieldIds = new Set(getFields(explore).map(getItemId));
    const errors: string[] = [];
    const additionalMetrics = (node.customMetrics ?? []).flatMap(
        (customMetric) => {
            const id = getItemId(customMetric);
            if (exploreFieldIds.has(id)) {
                errors.push(
                    `"${id}" already names a field of the explore; give the custom metric another name.`,
                );
                return [];
            }
            if (!node.metrics.includes(id)) {
                errors.push(`add "${id}" to metrics to select it.`);
            }
            try {
                return [toAdditionalMetric(customMetric, explore)];
            } catch (e) {
                errors.push(getErrorMessage(e));
                return [];
            }
        },
    );
    return { value: additionalMetrics, errors };
};

const toPeriodComparisonMetric = (
    periodComparison: ToolComposerPeriodComparison,
    node: ToolComposerSemanticLayerNode,
    explore: Explore,
    customMetrics: AdditionalMetric[],
): AdditionalMetric => {
    const { metricFieldId, timeDimensionFieldId, periodOffset } =
        periodComparison;
    if (!node.dimensions.includes(timeDimensionFieldId)) {
        throw new Error(`"${timeDimensionFieldId}" must be in dimensions.`);
    }
    const timeDimension = getDimensions(explore).find(
        (field) => getItemId(field) === timeDimensionFieldId,
    );
    const granularity = timeDimension?.timeInterval;
    if (!granularity || !isSupportedPeriodOverPeriodGranularity(granularity)) {
        throw new Error(
            `"${timeDimensionFieldId}" has no day, week, month, quarter or year grain; compare on a time dimension at one of those grains.`,
        );
    }
    if (!node.metrics.includes(metricFieldId)) {
        throw new Error(`"${metricFieldId}" must be in metrics.`);
    }
    const customMetric = customMetrics.find(
        (metric) => getItemId(metric) === metricFieldId,
    );
    if (customMetric?.filters?.length) {
        throw new Error(
            `cannot compare the filtered custom metric "${metricFieldId}"; compare an unfiltered metric.`,
        );
    }
    const baseMetric =
        customMetric ??
        getMetrics(explore).find((field) => getItemId(field) === metricFieldId);
    if (!baseMetric) {
        throw new Error(`"${metricFieldId}" is not a metric of the explore.`);
    }
    // Definitions stay deterministic so an unchanged node resubmits as the same node.
    const { uuid, ...additionalMetric } = buildPopAdditionalMetric({
        metric: { ...baseMetric, label: baseMetric.label ?? baseMetric.name },
        timeDimensionId: timeDimensionFieldId,
        granularity,
        periodOffset,
    }).additionalMetric;
    return baseMetric.percentile !== undefined
        ? { ...additionalMetric, percentile: baseMetric.percentile }
        : additionalMetric;
};

const toPeriodComparisonMetrics = (
    node: ToolComposerSemanticLayerNode,
    explore: Explore,
    customMetrics: AdditionalMetric[],
): Resolved<AdditionalMetric[]> => {
    const compiledIds = new Set(customMetrics.map(getItemId));
    // A custom metric that failed to compile already reports its own error.
    const failedIds = new Set(
        (node.customMetrics ?? [])
            .map(getItemId)
            .filter((id) => !compiledIds.has(id)),
    );
    const errors: string[] = [];
    const metrics = (node.periodComparisons ?? []).flatMap(
        (periodComparison) => {
            if (failedIds.has(periodComparison.metricFieldId)) return [];
            try {
                return [
                    toPeriodComparisonMetric(
                        periodComparison,
                        node,
                        explore,
                        customMetrics,
                    ),
                ];
            } catch (e) {
                errors.push(getErrorMessage(e));
                return [];
            }
        },
    );
    return {
        value: metrics.filter(
            (metric, index) =>
                metrics.findIndex((m) => getItemId(m) === getItemId(metric)) ===
                index,
        ),
        errors,
    };
};

// runQuery's resolver, so unknown fields come back with suggestions.
const resolveFilters = (
    node: ToolComposerSemanticLayerNode,
    explore: Explore,
    additionalMetrics: AdditionalMetric[],
): Resolved<Filters | null> => {
    if (node.filters === null) return { value: null, errors: [] };
    const result = resolveExploreFilterExpressions({
        filters: node.filters,
        explore,
        additionalMetrics,
    });
    return result.success
        ? { value: result.data, errors: [] }
        : {
              value: null,
              errors: [formatFilterExpressionError(result.error)],
          };
};

const resolveSemanticLayerNode = (
    node: ToolComposerSemanticLayerNode,
    { getExplore }: ResolveOptions,
): ResolvedToolComposerQueryNode => {
    const { customMetrics, periodComparisons, ...rest } = node;
    const needsExplore =
        node.filters !== null ||
        !!customMetrics?.length ||
        !!periodComparisons?.length;
    if (!needsExplore) {
        return { ...rest, filters: null, additionalMetrics: [] };
    }
    const explore = getExplore(node.exploreName);
    const customMetricDefinitions = toAdditionalMetrics(node, explore);
    const periodComparisonMetrics = toPeriodComparisonMetrics(
        node,
        explore,
        customMetricDefinitions.value,
    );
    const additionalMetrics = [
        ...customMetricDefinitions.value,
        ...periodComparisonMetrics.value,
    ];
    const filters = resolveFilters(node, explore, additionalMetrics);
    const errors = [
        ...describeErrors(
            node,
            'customMetrics',
            customMetricDefinitions.errors,
        ),
        ...describeErrors(
            node,
            'periodComparisons',
            periodComparisonMetrics.errors,
        ),
        ...describeErrors(node, 'filters', filters.errors),
    ];
    if (errors.length > 0) throw new AiAgentValidatorError(errors.join('\n'));
    return {
        ...rest,
        metrics: expandMetricsWithPopAdditionalMetrics(
            node.metrics,
            additionalMetrics,
        ),
        filters: filters.value,
        additionalMetrics,
    };
};

export const resolveComposerQueryNode = (
    node: ToolComposerQueryNode,
    options: ResolveOptions,
): ResolvedToolComposerQueryNode =>
    node.sourceType === QuerySourceType.SEMANTIC_LAYER
        ? resolveSemanticLayerNode(node, options)
        : node;
