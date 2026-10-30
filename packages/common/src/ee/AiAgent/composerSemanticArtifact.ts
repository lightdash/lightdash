import { type Explore } from '../../types/explore';
import { DimensionType, MetricType } from '../../types/field';
import {
    FilterOperator,
    FilterType,
    isFilterRule,
    type FilterGroup,
    type Filters,
    type MetricFilterRule,
} from '../../types/filter';
import {
    isPeriodOverPeriodAdditionalMetric,
    type AdditionalMetric,
} from '../../types/metricQuery';
import { type SemanticLayerSourceQuery } from '../../types/querySources';
import assertUnreachable from '../../utils/assertUnreachable';
import { getDimensions } from '../../utils/fields';
import { getFilterTypeFromItemType } from '../../utils/filters';
import { getItemId } from '../../utils/item';
import type {
    AiCustomChartTypeChartArtifactConfig,
    AiSemanticChartArtifactConfig,
} from './index';
import {
    toolRunQueryExpressionResolvedArgsSchema,
    type ComposerBuiltinChartVizConfig,
    type ComposerStoredChartVizConfig,
    type ToolRunQueryBuiltinChartConfig,
    type ToolRunQueryChartConfig,
} from './schemas';

/** A semantic artifact version: the classic runQuery replay payload. */
export type AiComposerSemanticArtifactVersion = {
    artifactType: 'chart';
    title: string;
    description?: string;
    vizConfig:
        | AiSemanticChartArtifactConfig
        | AiCustomChartTypeChartArtifactConfig;
};

// Persisted rules require a fieldType, which parsing validates and then drops.
const fieldTypeOf = (filterType: FilterType): DimensionType => {
    switch (filterType) {
        case FilterType.STRING:
            return DimensionType.STRING;
        case FilterType.NUMBER:
            return DimensionType.NUMBER;
        case FilterType.DATE:
            return DimensionType.DATE;
        case FilterType.BOOLEAN:
            return DimensionType.BOOLEAN;
        default:
            return assertUnreachable(filterType, 'Unknown filter type');
    }
};

const isFilterType = (value: unknown): value is FilterType =>
    Object.values<unknown>(FilterType).includes(value);

/** A flat group back in the persisted per-category shape; undefined when it cannot be. */
const toResolvedFilterGroup = (group: FilterGroup | undefined) => {
    if (!group) return null;
    const [connector, items] =
        'and' in group ? (['and', group.and] as const) : ['or', group.or];
    if (items.length === 0) return null;
    const rules = items.map((item) => {
        if (!isFilterRule(item)) return undefined;
        const { target, operator, values } = item;
        const settings: unknown = item.settings;
        const filterType =
            'fieldFilterType' in target ? target.fieldFilterType : undefined;
        if (!isFilterType(filterType)) return undefined;
        const hasValues =
            operator !== FilterOperator.NULL &&
            operator !== FilterOperator.NOT_NULL;
        return {
            fieldId: target.fieldId,
            fieldType: fieldTypeOf(filterType),
            fieldFilterType: filterType,
            operator,
            ...(hasValues ? { values: values ?? [] } : {}),
            ...(settings !== undefined ? { settings } : {}),
        };
    });
    return rules.every((rule) => rule !== undefined)
        ? { connector, rules }
        : undefined;
};

const toResolvedFilters = (filters: Filters | undefined) => {
    const dimensions = toResolvedFilterGroup(filters?.dimensions);
    const metrics = toResolvedFilterGroup(filters?.metrics);
    const tableCalculations = toResolvedFilterGroup(filters?.tableCalculations);
    if (
        dimensions === undefined ||
        metrics === undefined ||
        tableCalculations === undefined
    ) {
        return undefined;
    }
    return dimensions || metrics || tableCalculations
        ? { dimensions, metrics, tableCalculations }
        : null;
};

const toRunQueryVizType = (
    vizConfig: ComposerBuiltinChartVizConfig,
): ToolRunQueryBuiltinChartConfig['defaultVizType'] | null => {
    switch (vizConfig.type) {
        case 'bar':
            return vizConfig.horizontal ? 'horizontal' : 'bar';
        case 'line':
            return 'line';
        // Classic areas stack the secondary axis with the primary one.
        case 'area':
            return vizConfig.y2 === null ? 'line' : null;
        case 'table':
        case 'scatter':
        case 'pie':
        case 'funnel':
            return vizConfig.type;
        case 'big_number':
            return null;
        default:
            return assertUnreachable(vizConfig.type, 'Unknown viz type');
    }
};

const toRunQueryChartConfig = (
    vizConfig: ComposerStoredChartVizConfig,
): ToolRunQueryChartConfig | undefined => {
    if (vizConfig.type === 'custom') {
        return {
            customChartTypeSlug: vizConfig.customChartTypeSlug,
            fieldMapping: vizConfig.fieldMapping,
            options: vizConfig.options,
        };
    }
    const defaultVizType = toRunQueryVizType(vizConfig);
    if (defaultVizType === null) return undefined;
    const { type, labels } = vizConfig;
    const isCartesian = ['bar', 'line', 'area', 'scatter'].includes(type);
    return {
        defaultVizType,
        xAxisDimension: vizConfig.x,
        yAxisMetrics: vizConfig.y,
        groupBy: isCartesian ? vizConfig.groupBy : null,
        xAxisType: null,
        stackBars: type === 'bar' ? vizConfig.stack : null,
        lineType: type === 'area' ? 'area' : null,
        xAxisLabel: labels?.x ?? '',
        yAxisLabel: labels?.y ?? '',
        secondaryYAxisMetric:
            isCartesian && type !== 'scatter' ? vizConfig.y2 : null,
        secondaryYAxisLabel: labels?.y2 ?? null,
    };
};

const runQueryAggregations: MetricType[] = [
    MetricType.AVERAGE,
    MetricType.COUNT,
    MetricType.COUNT_DISTINCT,
    MetricType.MAX,
    MetricType.MIN,
    MetricType.SUM,
    MetricType.MEDIAN,
];

/** A metric filter as runQuery persists it; undefined when its field is unknown. */
const toRunQueryMetricFilter = (rule: MetricFilterRule, explore: Explore) => {
    const dimension = getDimensions(explore).find(
        (field) => `${field.table}.${field.name}` === rule.target.fieldRef,
    );
    if (!dimension) return undefined;
    const fieldFilterType = getFilterTypeFromItemType(dimension.type);
    const settings: unknown = rule.settings;
    const hasValues =
        rule.operator !== FilterOperator.NULL &&
        rule.operator !== FilterOperator.NOT_NULL;
    return {
        table: dimension.table,
        filter: {
            fieldId: getItemId(dimension),
            fieldType: dimension.type,
            fieldFilterType,
            operator: rule.operator,
            ...(hasValues ? { values: rule.values ?? [] } : {}),
            ...(settings !== undefined ? { settings } : {}),
        },
    };
};

/** runQuery's custom metrics for a node's additional metrics; undefined when one cannot be carried. */
const toRunQueryCustomMetrics = (
    additionalMetrics: AdditionalMetric[],
    explore: Explore | null,
) => {
    const customMetrics = additionalMetrics.map((metric) => {
        if (isPeriodOverPeriodAdditionalMetric(metric)) {
            // runQuery's comparison builder drops distinct keys and percentiles.
            if (metric.distinctKeys?.length || metric.percentile !== undefined)
                return undefined;
            return {
                kind: 'periodComparison' as const,
                baseMetricId: metric.baseMetricId,
                timeDimensionId: metric.timeDimensionId,
                granularity: metric.granularity,
                periodOffset: metric.periodOffset,
            };
        }
        if (
            !metric.baseDimensionName ||
            !runQueryAggregations.includes(metric.type)
        ) {
            return undefined;
        }
        const filters = (metric.filters ?? []).map((rule) =>
            explore ? toRunQueryMetricFilter(rule, explore) : undefined,
        );
        if (filters.some((filter) => filter === undefined)) return undefined;
        return {
            kind: 'aggregation' as const,
            name: metric.name,
            label: metric.label ?? metric.name,
            description: metric.description ?? '',
            baseDimensionName: getItemId({
                table: metric.table,
                name: metric.baseDimensionName,
            }),
            table: metric.table,
            type: metric.type,
            filters: filters.length > 0 ? filters : null,
        };
    });
    return customMetrics.every((metric) => metric !== undefined)
        ? customMetrics
        : undefined;
};

// Fields the runQuery payload has no place for.
const hasClassicQueryShape = (node: SemanticLayerSourceQuery): boolean =>
    !node.tableCalculations?.length &&
    !node.customDimensions?.length &&
    !node.metricOverrides &&
    !node.dimensionOverrides &&
    !node.timezone &&
    !node.pivotConfiguration;

/**
 * The semantic artifact version a lone semantic-layer node presents as, so it
 * keeps the classic interactions. Null when the classic payload cannot carry
 * the node or its viz config.
 */
export const toComposerSemanticArtifactVersion = ({
    title,
    description,
    node,
    vizConfig,
    maxQueryLimit,
    explore,
}: {
    title: string;
    description: string | null;
    node: SemanticLayerSourceQuery;
    vizConfig: ComposerStoredChartVizConfig;
    /** The classic artifact clamps its limit to this. */
    maxQueryLimit: number;
    /** Types custom metric filters; null when the explore is unavailable. */
    explore: Explore | null;
}): AiComposerSemanticArtifactVersion | null => {
    if (!hasClassicQueryShape(node)) return null;
    if (node.limit !== undefined && node.limit > maxQueryLimit) return null;
    const filters = toResolvedFilters(node.filters);
    const chartConfig = toRunQueryChartConfig(vizConfig);
    const additionalMetrics = node.additionalMetrics ?? [];
    const customMetrics = toRunQueryCustomMetrics(additionalMetrics, explore);
    if (
        filters === undefined ||
        chartConfig === undefined ||
        customMetrics === undefined
    ) {
        return null;
    }
    // runQuery derives period comparison columns from customMetrics itself.
    const generatedMetricIds = new Set(
        additionalMetrics
            .filter(isPeriodOverPeriodAdditionalMetric)
            .map(getItemId),
    );

    const parsed = toolRunQueryExpressionResolvedArgsSchema.safeParse({
        title,
        description: description ?? '',
        queryConfig: {
            exploreName: node.exploreName,
            dimensions: node.dimensions,
            metrics: node.metrics.filter(
                (metricId) => !generatedMetricIds.has(metricId),
            ),
            filters,
            sorts: node.sorts ?? [],
            limit: node.limit ?? null,
            parameters: node.parameters ?? null,
            customMetrics: customMetrics.length > 0 ? customMetrics : null,
            tableCalculations: null,
        },
        chartConfig,
        mergeConfig: null,
    });
    if (!parsed.success) return null;

    const version = {
        artifactType: 'chart' as const,
        title,
        ...(description ? { description } : {}),
    };
    if (vizConfig.type !== 'custom') {
        return {
            ...version,
            vizConfig: { source: 'semantic', config: parsed.data },
        };
    }
    return {
        ...version,
        vizConfig: {
            source: 'customChartType',
            schemaVersion: 1,
            dataAppVizUuid: vizConfig.dataAppVizUuid,
            ...(vizConfig.dataAppVizVersion !== null
                ? { dataAppVizVersion: vizConfig.dataAppVizVersion }
                : {}),
            config: parsed.data,
        },
    };
};
