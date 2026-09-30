import {
    isField,
    isMetric,
    isTableCalculation,
    type CustomDimension,
    type Dimension,
    type ItemsMap,
    type Metric,
    type TableCalculation,
    type TableCalculationMetadata,
    type TreemapChart,
} from '@lightdash/common';
import { type VisualizationResults } from '../types';

type MutableTreemapNode = {
    name: string;
    value: number[];
    children: Record<string, MutableTreemapNode>;
};

//For use with eCharts config
export type TreemapNode = {
    name: string;
    value: number[];
    children?: TreemapNode[];
};

/**
 * The subtotals of every grouping level, keyed by the colon-joined dimension
 * names of the level (`dim_a`, `dim_a:dim_b`, ...). Each entry holds the
 * dimension values and the aggregated metrics of one group. The frontend
 * fetches these from the API (`useAsyncCalculateSubtotals`).
 */
export type TreemapGroupedSubtotals = Record<string, Record<string, number>[]>;

export type TreemapMetricItem = Metric | TableCalculation;

export const TREEMAP_DEFAULT_VISIBLE_MIN = 100;
export const TREEMAP_DEFAULT_LEAF_DEPTH = 2;
export const TREEMAP_DEFAULT_START_COLOR = '#91cc75';
export const TREEMAP_DEFAULT_END_COLOR = '#ee6666';

/**
 * The saved group field ids when they match the query's dimensions exactly,
 * otherwise every dimension of the query.
 */
export const getValidTreemapGroupFieldIds = (
    groupFieldIds: string[] | undefined,
    dimensionIds: string[],
): string[] => {
    if (
        dimensionIds.length === groupFieldIds?.length &&
        groupFieldIds?.every((id) => dimensionIds.includes(id))
    ) {
        return groupFieldIds;
    }
    return dimensionIds;
};

/** The metric or table calculation behind a treemap metric id, when it is one. */
export const getTreemapMetricItem = (
    itemsMap: ItemsMap | undefined,
    metricId: string | null,
): TreemapMetricItem | undefined => {
    if (!itemsMap || !metricId) return undefined;
    const item = itemsMap[metricId];

    if ((isField(item) && isMetric(item)) || isTableCalculation(item))
        return item;

    return undefined;
};

/**
 * The size metric id to select once the results are in: the current one
 * when it is still a numeric metric of the query, its new name when it is a
 * renamed table calculation, otherwise the first numeric metric.
 * Returns `undefined` when nothing should change.
 */
export const repairTreemapSizeMetricId = ({
    sizeMetricId,
    allNumericMetricIds,
    isLoading,
    tableCalculationsMetadata,
}: {
    sizeMetricId: string | null;
    allNumericMetricIds: string[];
    isLoading: boolean;
    tableCalculationsMetadata: TableCalculationMetadata[] | undefined;
}): string | null | undefined => {
    if (isLoading || allNumericMetricIds.length === 0) return undefined;
    if (sizeMetricId && allNumericMetricIds.includes(sizeMetricId))
        return undefined;

    /**
     * When table calculations update, their name changes, so we need to update the selected fields
     * If the selected field is a table calculation with the old name in the metadata, set it to the new name
     */
    if (tableCalculationsMetadata) {
        const metricTcIndex = tableCalculationsMetadata.findIndex(
            (tc) => tc.oldName === sizeMetricId,
        );

        if (metricTcIndex !== -1) {
            return tableCalculationsMetadata[metricTcIndex].name;
        }
    }

    return allNumericMetricIds[0] ?? null;
};

/** The group field ids with the item at `from` moved to `to`. */
export const reorderTreemapGroupFieldIds = <T>(
    prev: T[],
    { from, to }: { from: number; to: number },
): T[] => {
    const cloned = [...prev];
    const item = prev[from];

    cloned.splice(from, 1);
    cloned.splice(to, 0, item);

    return cloned;
};

export type BuildTreemapDataArgs = {
    resultsData: Pick<VisualizationResults, 'rows'> | undefined;
    sizeMetricId: string | null;
    selectedSizeMetric: TreemapMetricItem | undefined;
    colorMetricId: string | null;
    groupFieldIds: string[];
    /** Subtotals of every grouping level, from the API; parent values stay 0 without them. */
    groupedSubtotals: TreemapGroupedSubtotals | undefined;
};

/**
 * The nested treemap nodes: one level per group field, in order, leaf values
 * from the rows and parent values from the grouped subtotals.
 */
export const buildTreemapData = ({
    resultsData,
    sizeMetricId,
    selectedSizeMetric,
    colorMetricId,
    groupFieldIds,
    groupedSubtotals,
}: BuildTreemapDataArgs): TreemapNode[] => {
    if (!resultsData) return [];
    if (
        !sizeMetricId ||
        !selectedSizeMetric ||
        !resultsData ||
        resultsData.rows.length === 0 ||
        !groupFieldIds ||
        groupFieldIds.length === 0
    ) {
        return [];
    }

    const isMetricPresentInResults = resultsData?.rows.some(
        (r) => r[sizeMetricId],
    );

    if (!isMetricPresentInResults) {
        return [];
    }

    const getEmptyTreemapNode = (name: string): MutableTreemapNode => ({
        name,
        value: [0, 0],
        children: {},
    });

    const rootTreemapNode = resultsData.rows.reduce<MutableTreemapNode>(
        (acc, row) => {
            let parent = acc;
            const rowSizeMetricValue = Number(
                row[sizeMetricId]?.value?.raw ?? 0,
            );
            const rowColorMetricValue = colorMetricId
                ? Number(row[colorMetricId]?.value?.raw ?? 0)
                : 0;

            // Assumes parent-child relationship is determined by the order of groupFieldIds
            for (let i = 0; i < groupFieldIds.length; i += 1) {
                const dimensionValueRaw = String(
                    row[groupFieldIds[i]]?.value?.raw,
                );

                const dimensionValueFormatted = String(
                    row[groupFieldIds[i]]?.value?.formatted,
                );

                if (!parent.children[dimensionValueRaw]) {
                    parent.children[dimensionValueRaw] = getEmptyTreemapNode(
                        dimensionValueFormatted,
                    );
                }
                if (i === groupFieldIds.length - 1) {
                    parent.children[dimensionValueRaw].value = [
                        rowSizeMetricValue,
                        rowColorMetricValue,
                    ];
                }
                parent = parent.children[dimensionValueRaw];
            }
            return acc;
        },
        getEmptyTreemapNode('root'),
    );

    // Convert the structure's children into an array
    const convertToArray = (node: MutableTreemapNode): TreemapNode[] => {
        const children = Object.values(node.children).flatMap(convertToArray);
        return [
            {
                name: node.name,
                value: node.value,
                children: children.length > 0 ? children : undefined,
            },
        ];
    };

    // Iterate on the grouped subtotals, adjusting the parent values in the treemap with the subtotal aggregated values
    if (groupedSubtotals) {
        Object.entries(groupedSubtotals).forEach(([key, levelSubtotals]) => {
            const subtotalDimensionNames = key.split(':');
            levelSubtotals.forEach((subtotalValueObject) => {
                let parent = rootTreemapNode;
                const subtotalDimensionValues = subtotalDimensionNames.map(
                    (k) => subtotalValueObject[k],
                ); // Values of the dimensions

                subtotalDimensionValues.forEach((dimValue, index) => {
                    if (index === subtotalDimensionNames.length - 1) {
                        if (parent?.children?.[dimValue]) {
                            // Handles null values
                            parent.children[dimValue].value[0] =
                                subtotalValueObject[sizeMetricId];
                            if (colorMetricId) {
                                parent.children[dimValue].value[1] =
                                    subtotalValueObject[colorMetricId];
                            }
                        }
                    }
                    parent = parent?.children?.[dimValue];
                });
            });
        });
    }
    return convertToArray(rootTreemapNode)[0].children || [];
};

export type ResolveTreemapChartConfigArgs = {
    chartConfig: TreemapChart | undefined;
    resultsData: Pick<VisualizationResults, 'rows'> | undefined;
    itemsMap: ItemsMap | undefined;
    dimensions: Record<string, CustomDimension | Dimension>;
    numericMetrics: Record<string, Metric | TableCalculation>;
    tableCalculationsMetadata?: TableCalculationMetadata[];
    /** Subtotals of every grouping level, from the API; parent values stay 0 without them. */
    groupedSubtotals?: TreemapGroupedSubtotals;
};

export type ResolvedTreemapChartConfig = {
    validConfig: TreemapChart;
    sizeMetricId: string | null;
    selectedSizeMetric: TreemapMetricItem | undefined;
    colorMetricId: string | null;
    selectedColorMetric: TreemapMetricItem | undefined;
    groupFieldIds: string[];
    data: TreemapNode[];
};

/**
 * The treemap config and data a freshly mounted editor would show for the
 * saved config: defaults filled in, group fields validated against the
 * query's dimensions, the size metric repaired and the tree built.
 */
export const resolveTreemapChartConfig = ({
    chartConfig,
    resultsData,
    itemsMap,
    dimensions,
    numericMetrics,
    tableCalculationsMetadata,
    groupedSubtotals,
}: ResolveTreemapChartConfigArgs): ResolvedTreemapChartConfig => {
    const visibleMin = chartConfig?.visibleMin ?? TREEMAP_DEFAULT_VISIBLE_MIN;
    const leafDepth = chartConfig?.leafDepth ?? TREEMAP_DEFAULT_LEAF_DEPTH;
    const groupFieldIds = getValidTreemapGroupFieldIds(
        chartConfig?.groupFieldIds,
        Object.keys(dimensions),
    );
    const colorMetricId = chartConfig?.colorMetricId ?? null;
    const startColor = chartConfig?.startColor ?? TREEMAP_DEFAULT_START_COLOR;
    const endColor = chartConfig?.endColor ?? TREEMAP_DEFAULT_END_COLOR;
    const useDynamicColors = chartConfig?.useDynamicColors ?? false;
    const startColorThreshold = chartConfig?.startColorThreshold ?? undefined;
    const endColorThreshold = chartConfig?.endColorThreshold ?? undefined;

    const initialSizeMetricId = chartConfig?.sizeMetricId ?? null;
    const repairedSizeMetricId = repairTreemapSizeMetricId({
        sizeMetricId: initialSizeMetricId,
        allNumericMetricIds: Object.keys(numericMetrics),
        isLoading: !resultsData,
        tableCalculationsMetadata,
    });
    const sizeMetricId =
        repairedSizeMetricId === undefined
            ? initialSizeMetricId
            : repairedSizeMetricId;

    const selectedSizeMetric = getTreemapMetricItem(itemsMap, sizeMetricId);
    const selectedColorMetric = getTreemapMetricItem(itemsMap, colorMetricId);

    const data = buildTreemapData({
        resultsData,
        sizeMetricId,
        selectedSizeMetric,
        colorMetricId,
        groupFieldIds,
        groupedSubtotals,
    });

    return {
        validConfig: {
            visibleMin,
            leafDepth,
            groupFieldIds,
            sizeMetricId: sizeMetricId ?? undefined,
            useDynamicColors,
            colorMetricId: colorMetricId ?? undefined,
            startColor,
            endColor,
            startColorThreshold,
            endColorThreshold,
        },
        sizeMetricId,
        selectedSizeMetric,
        colorMetricId,
        selectedColorMetric,
        groupFieldIds,
        data,
    };
};
