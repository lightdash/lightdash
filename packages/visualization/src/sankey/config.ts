import {
    getDimensionsFromItemsMap,
    getMetricsFromItemsMap,
    getTableCalculationsFromItemsMap,
    isNumericItem,
    type CustomDimension,
    type Dimension,
    type ItemsMap,
    type Metric,
    type SankeyChart,
    type TableCalculation,
    type TableCalculationMetadata,
} from '@lightdash/common';
import { type VisualizationResults } from '../types';
import { transformSankeyData, type SankeySeriesDataPoint } from './transform';

export type SankeyNodeAlign = NonNullable<SankeyChart['nodeAlign']>;
export type SankeyOrient = NonNullable<SankeyChart['orient']>;
export type SankeyNodeLayoutOption = NonNullable<SankeyChart['nodeLayout']>;

export const DEFAULT_SANKEY_NODE_ALIGN: SankeyNodeAlign = 'justify';
export const DEFAULT_SANKEY_ORIENT: SankeyOrient = 'horizontal';
export const DEFAULT_SANKEY_NODE_LAYOUT: SankeyNodeLayoutOption = 'multi-step';

export const EMPTY_SANKEY_DATA: SankeySeriesDataPoint = {
    nodes: [],
    links: [],
    maxDepth: 0,
    hasCycle: false,
};

export type SankeyFields = {
    dimensions: Record<string, CustomDimension | Dimension>;
    numericFields: Record<string, Metric | TableCalculation>;
};

/**
 * The fields a sankey chart can be built from: every dimension for the
 * source and target nodes, numeric metrics and numeric table calculations
 * for the link value.
 */
export const getSankeyFields = (
    itemsMap: ItemsMap | undefined,
): SankeyFields => {
    const metrics = getMetricsFromItemsMap(itemsMap ?? {}, isNumericItem);
    const tableCalculations = getTableCalculationsFromItemsMap(itemsMap);

    const numericTableCalculations = Object.keys(tableCalculations).reduce<
        Record<string, TableCalculation>
    >((acc, key) => {
        const tableCalculation = tableCalculations[key];
        if (isNumericItem(tableCalculation)) {
            acc[key] = tableCalculation;
        }
        return acc;
    }, {});

    return {
        dimensions: getDimensionsFromItemsMap(itemsMap ?? {}),
        numericFields: { ...metrics, ...numericTableCalculations },
    };
};

/** The new name of a renamed table calculation, when `fieldId` was its old name. */
const getRenamedTableCalculation = (
    fieldId: string | null,
    tableCalculationsMetadata: TableCalculationMetadata[] | undefined,
): string | undefined => {
    if (!tableCalculationsMetadata || !fieldId) return undefined;
    return tableCalculationsMetadata.find((tc) => tc.oldName === fieldId)?.name;
};

/**
 * The source field the editor auto-selects: the current one when it is still
 * a dimension, its new name after a table calculation rename, else the first
 * dimension. Nothing changes while the results load or with under two
 * dimensions.
 */
export const resolveSankeySourceFieldId = ({
    sourceFieldId,
    dimensionIds,
    isLoading,
    tableCalculationsMetadata,
}: {
    sourceFieldId: string | null;
    dimensionIds: string[];
    isLoading: boolean;
    tableCalculationsMetadata?: TableCalculationMetadata[];
}): string | null => {
    if (isLoading || dimensionIds.length < 2) return sourceFieldId;

    if (!sourceFieldId || !dimensionIds.includes(sourceFieldId)) {
        // Handle table calculation renames
        const renamed = getRenamedTableCalculation(
            sourceFieldId,
            tableCalculationsMetadata,
        );
        if (renamed) return renamed;
        return dimensionIds[0];
    }
    return sourceFieldId;
};

/**
 * The target field the editor auto-selects: the current one when it is still
 * a dimension, its new name after a table calculation rename, else the first
 * dimension that is not the source.
 */
export const resolveSankeyTargetFieldId = ({
    targetFieldId,
    sourceFieldId,
    dimensionIds,
    isLoading,
    tableCalculationsMetadata,
}: {
    targetFieldId: string | null;
    sourceFieldId: string | null;
    dimensionIds: string[];
    isLoading: boolean;
    tableCalculationsMetadata?: TableCalculationMetadata[];
}): string | null => {
    if (isLoading || dimensionIds.length < 2) return targetFieldId;

    if (!targetFieldId || !dimensionIds.includes(targetFieldId)) {
        const renamed = getRenamedTableCalculation(
            targetFieldId,
            tableCalculationsMetadata,
        );
        if (renamed) return renamed;
        // Pick the second dimension, different from source
        const available = dimensionIds.filter(
            (id) => id !== (sourceFieldId ?? dimensionIds[0]),
        );
        return available[0] ?? dimensionIds[1] ?? null;
    }
    return targetFieldId;
};

/**
 * The metric field the editor auto-selects: the current one when it is still
 * a numeric field, its new name after a table calculation rename, else the
 * first numeric field. Nothing changes while the results load or without
 * numeric fields.
 */
export const resolveSankeyMetricFieldId = ({
    metricFieldId,
    numericFieldIds,
    isLoading,
    tableCalculationsMetadata,
}: {
    metricFieldId: string | null;
    numericFieldIds: string[];
    isLoading: boolean;
    tableCalculationsMetadata?: TableCalculationMetadata[];
}): string | null => {
    if (isLoading || numericFieldIds.length === 0) return metricFieldId;

    if (!metricFieldId || !numericFieldIds.includes(metricFieldId)) {
        const renamed = getRenamedTableCalculation(
            metricFieldId,
            tableCalculationsMetadata,
        );
        if (renamed) return renamed;
        return numericFieldIds[0];
    }
    return metricFieldId;
};

/** The nodes and links of the chart, empty until every field is chosen. */
export const getSankeyData = ({
    resultsData,
    sourceFieldId,
    targetFieldId,
    metricFieldId,
    nodeLayout,
}: {
    resultsData: Pick<VisualizationResults, 'rows'> | undefined;
    sourceFieldId: string | null;
    targetFieldId: string | null;
    metricFieldId: string | null;
    nodeLayout: SankeyNodeLayoutOption;
}): SankeySeriesDataPoint => {
    if (!resultsData || !sourceFieldId || !targetFieldId || !metricFieldId) {
        return { nodes: [], links: [], maxDepth: 0, hasCycle: false };
    }
    return transformSankeyData(
        resultsData.rows,
        { sourceFieldId, targetFieldId, metricFieldId },
        { nodeLayout },
    );
};

export const buildValidSankeyConfig = ({
    sourceFieldId,
    targetFieldId,
    metricFieldId,
    nodeAlign,
    orient,
    nodeLayout,
}: {
    sourceFieldId: string | null;
    targetFieldId: string | null;
    metricFieldId: string | null;
    nodeAlign: SankeyNodeAlign;
    orient: SankeyOrient;
    nodeLayout: SankeyNodeLayoutOption;
}): SankeyChart => ({
    sourceFieldId: sourceFieldId ?? undefined,
    targetFieldId: targetFieldId ?? undefined,
    metricFieldId: metricFieldId ?? undefined,
    nodeAlign,
    orient,
    nodeLayout,
});

export type ResolveSankeyChartConfigArgs = {
    chartConfig: SankeyChart | undefined;
    resultsData: Pick<VisualizationResults, 'rows'> | undefined;
    itemsMap: ItemsMap | undefined;
    /** Defaults to the dimensions of `itemsMap`; see `getSankeyFields`. */
    dimensions?: SankeyFields['dimensions'];
    /** Defaults to the numeric fields of `itemsMap`; see `getSankeyFields`. */
    numericFields?: SankeyFields['numericFields'];
    tableCalculationsMetadata?: TableCalculationMetadata[];
};

/**
 * Resolves a saved sankey chart config against query results, the way the
 * editor does when it first mounts a chart: auto-selects the source, target
 * and metric fields when the saved ones are missing or gone, and fills in the
 * layout defaults. Returns the valid config and the transformed data.
 *
 * The frontend's `useSankeyChartConfig` runs the same steps inside its
 * effects; this is the one-shot equivalent for headless rendering.
 */
export const resolveSankeyChartConfig = ({
    chartConfig,
    resultsData,
    itemsMap,
    dimensions,
    numericFields,
    tableCalculationsMetadata,
}: ResolveSankeyChartConfigArgs): {
    validConfig: SankeyChart;
    data: SankeySeriesDataPoint;
} => {
    const fields =
        dimensions && numericFields ? undefined : getSankeyFields(itemsMap);
    const dimensionIds = Object.keys(dimensions ?? fields?.dimensions ?? {});
    const numericFieldIds = Object.keys(
        numericFields ?? fields?.numericFields ?? {},
    );
    const isLoading = !resultsData;

    const initialSourceFieldId = chartConfig?.sourceFieldId ?? null;
    const sourceFieldId = resolveSankeySourceFieldId({
        sourceFieldId: initialSourceFieldId,
        dimensionIds,
        isLoading,
        tableCalculationsMetadata,
    });
    // The editor's effects all read the state of the first render, so the
    // target is chosen against the saved source, not the resolved one.
    const targetFieldId = resolveSankeyTargetFieldId({
        targetFieldId: chartConfig?.targetFieldId ?? null,
        sourceFieldId: initialSourceFieldId,
        dimensionIds,
        isLoading,
        tableCalculationsMetadata,
    });
    const metricFieldId = resolveSankeyMetricFieldId({
        metricFieldId: chartConfig?.metricFieldId ?? null,
        numericFieldIds,
        isLoading,
        tableCalculationsMetadata,
    });

    const nodeAlign = chartConfig?.nodeAlign ?? DEFAULT_SANKEY_NODE_ALIGN;
    const orient = chartConfig?.orient ?? DEFAULT_SANKEY_ORIENT;
    const nodeLayout = chartConfig?.nodeLayout ?? DEFAULT_SANKEY_NODE_LAYOUT;

    return {
        validConfig: buildValidSankeyConfig({
            sourceFieldId,
            targetFieldId,
            metricFieldId,
            nodeAlign,
            orient,
            nodeLayout,
        }),
        data: getSankeyData({
            resultsData,
            sourceFieldId,
            targetFieldId,
            metricFieldId,
            nodeLayout,
        }),
    };
};
