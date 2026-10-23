import { DimensionType } from '../../types/field';
import {
    FilterOperator,
    FilterType,
    isFilterRule,
    type FilterGroup,
    type Filters,
} from '../../types/filter';
import { type SemanticLayerSourceQuery } from '../../types/querySources';
import assertUnreachable from '../../utils/assertUnreachable';
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

// Fields the runQuery payload has no place for.
const hasClassicQueryShape = (node: SemanticLayerSourceQuery): boolean =>
    !node.tableCalculations?.length &&
    !node.additionalMetrics?.length &&
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
}: {
    title: string;
    description: string | null;
    node: SemanticLayerSourceQuery;
    vizConfig: ComposerStoredChartVizConfig;
    /** The classic artifact clamps its limit to this. */
    maxQueryLimit: number;
}): AiComposerSemanticArtifactVersion | null => {
    if (!hasClassicQueryShape(node)) return null;
    if (node.limit !== undefined && node.limit > maxQueryLimit) return null;
    const filters = toResolvedFilters(node.filters);
    const chartConfig = toRunQueryChartConfig(vizConfig);
    if (filters === undefined || chartConfig === undefined) return null;

    const parsed = toolRunQueryExpressionResolvedArgsSchema.safeParse({
        title,
        description: description ?? '',
        queryConfig: {
            exploreName: node.exploreName,
            dimensions: node.dimensions,
            metrics: node.metrics,
            filters,
            sorts: node.sorts ?? [],
            limit: node.limit ?? null,
            parameters: node.parameters ?? null,
            customMetrics: null,
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
