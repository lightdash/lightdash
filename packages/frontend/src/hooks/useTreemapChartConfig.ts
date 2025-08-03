import { isField, isMetric, isTableCalculation } from '@lightdash/common';

import type {
    CustomDimension,
    Dimension,
    ItemsMap,
    Metric,
    MetricQuery,
    ParametersValuesMap,
    TableCalculation,
    TableCalculationMetadata,
    TreemapChart,
} from '@lightdash/common';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCalculateSubtotals } from './useCalculateSubtotals';
import { type InfiniteQueryResults } from './useQueryResults';

type TreemapChartConfig = {
    validConfig: TreemapChart;

    groupFieldIds: (string | null)[];
    groupReorder: (args: { from: number; to: number }) => void;

    sizeMetricId: string | null;
    selectedSizeMetric: Metric | TableCalculation | undefined;
    sizeMetricChange: (sizeMetricId: string | null) => void;

    colorMetricId: string | null;
    selectedColorMetric: Metric | TableCalculation | undefined;
    colorMetricChange: (colorMetricId: string | null) => void;

    useDynamicColors: boolean;
    toggleDynamicColors?: () => void;
    startColor?: string;
    endColor?: string;
    onStartColorChange?: (color: string) => void;
    onEndColorChange?: (color: string) => void;
    topLevelColors?: string[];

    startColorThreshold?: number;
    setStartColorThreshold: (startColorThreshold: number) => void;
    endColorThreshold?: number;
    setEndColorThreshold: (endColorThreshold: number) => void;

    visibleMin: number;
    setVisibleMin: (visibleMin: number) => void;
    leafDepth: number;
    setLeafDepth: (leafDepth: number) => void;

    data: TreemapNode[];
};

type MutableTreemapNode = {
    name: string;
    value: number[];
    children: Record<string, MutableTreemapNode>;
};

//For use with eCharts config
type TreemapNode = {
    name: string;
    value: number[];
    children?: TreemapNode[];
};

export type TreemapChartConfigFn = (
    treemapConfig: TreemapChart | undefined,
    resultsData:
        | (InfiniteQueryResults & {
              metricQuery?: MetricQuery;
              fields?: ItemsMap;
          })
        | undefined,
    itemsMap: ItemsMap | undefined,
    dimensions: Record<string, CustomDimension | Dimension>,
    numericMetrics: Record<string, Metric | TableCalculation>,
    tableCalculationsMetadata?: TableCalculationMetadata[],
    parameters?: ParametersValuesMap,
) => TreemapChartConfig;

const useTreemapChartConfig: TreemapChartConfigFn = (
    treemapConfig,
    resultsData,
    itemsMap,
    dimensions,
    numericMetrics,
    tableCalculationsMetadata,
    parameters,
) => {
    const [visibleMin, setVisibleMin] = useState(
        treemapConfig?.visibleMin ?? 100,
    );
    const [leafDepth, setLeafDepth] = useState(treemapConfig?.leafDepth ?? 2);

    const dimensionIds = useMemo(() => Object.keys(dimensions), [dimensions]);

    const validGroupFieldIds = useMemo(() => {
        if (
            dimensionIds.length === treemapConfig?.groupFieldIds?.length &&
            treemapConfig.groupFieldIds?.every((id) =>
                dimensionIds.includes(id),
            )
        ) {
            return treemapConfig.groupFieldIds;
        }
        return dimensionIds;
    }, [treemapConfig?.groupFieldIds, dimensionIds]);

    const [groupFieldIds, setGroupFieldIds] = useState(validGroupFieldIds);

    const [sizeMetricId, setSizeMetricId] = useState(
        treemapConfig?.sizeMetricId ?? null,
    );
    const [colorMetricId, setColorMetricId] = useState(
        treemapConfig?.colorMetricId ?? null,
    );
    const [startColor, onStartColorChange] = useState(
        treemapConfig?.startColor ?? '#91cc75',
    );
    const [endColor, onEndColorChange] = useState(
        treemapConfig?.endColor ?? '#ee6666',
    );
    const [useDynamicColors, setDynamicColors] = useState(
        treemapConfig?.useDynamicColors ?? false,
    );
    const [startColorThreshold, setStartColorThreshold] = useState(
        treemapConfig?.startColorThreshold ?? undefined,
    );
    const [endColorThreshold, setEndColorThreshold] = useState(
        treemapConfig?.endColorThreshold ?? undefined,
    );

    const toggleDynamicColors = useCallback(() => {
        setDynamicColors((prev) => {
            if (prev) {
                setColorMetricId(null);
            }
            return !prev;
        });
    }, []);

    const allNumericMetricIds = useMemo(
        () => Object.keys(numericMetrics),
        [numericMetrics],
    );

    const selectedSizeMetric = useMemo(() => {
        if (!itemsMap || !sizeMetricId) return undefined;
        const item = itemsMap[sizeMetricId];

        if ((isField(item) && isMetric(item)) || isTableCalculation(item))
            return item;

        return undefined;
    }, [itemsMap, sizeMetricId]);

    const selectedColorMetric = useMemo(() => {
        if (!itemsMap || !colorMetricId) return undefined;
        const item = itemsMap[colorMetricId];

        if ((isField(item) && isMetric(item)) || isTableCalculation(item))
            return item;

        return undefined;
    }, [itemsMap, colorMetricId]);

    const isLoading = !resultsData;

    useEffect(() => {
        setGroupFieldIds(validGroupFieldIds);
    }, [validGroupFieldIds]);

    useEffect(() => {
        if (isLoading || allNumericMetricIds.length === 0) return;
        if (sizeMetricId && allNumericMetricIds.includes(sizeMetricId)) return;

        /**
         * When table calculations update, their name changes, so we need to update the selected fields
         * If the selected field is a table calculation with the old name in the metadata, set it to the new name
         */
        if (tableCalculationsMetadata) {
            const metricTcIndex = tableCalculationsMetadata.findIndex(
                (tc) => tc.oldName === sizeMetricId,
            );

            if (metricTcIndex !== -1) {
                setSizeMetricId(tableCalculationsMetadata[metricTcIndex].name);
                return;
            }
        }

        setSizeMetricId(allNumericMetricIds[0] ?? null);
    }, [
        allNumericMetricIds,
        isLoading,
        sizeMetricId,
        tableCalculationsMetadata,
    ]);

    const handleGroupReorder = useCallback(
        ({ from, to }: { from: number; to: number }) => {
            setGroupFieldIds((prev) => {
                const cloned = [...prev];
                const item = prev[from];

                cloned.splice(from, 1);
                cloned.splice(to, 0, item);

                return cloned;
            });
        },
        [],
    );

    const { data: groupedSubtotals } = useCalculateSubtotals({
        metricQuery: resultsData?.metricQuery,
        explore: resultsData?.metricQuery?.exploreName,
        showSubtotals: true,
        columnOrder: groupFieldIds,
        pivotDimensions: undefined,
        parameters,
    });

    const data = useMemo(() => {
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
                for (let i = 0; i < groupFieldIds.length; i++) {
                    const dimensionValueRaw = String(
                        row[groupFieldIds[i]]?.value?.raw,
                    );

                    const dimensionValueFormatted = String(
                        row[groupFieldIds[i]]?.value?.formatted,
                    );

                    if (!parent.children[dimensionValueRaw]) {
                        parent.children[dimensionValueRaw] =
                            getEmptyTreemapNode(dimensionValueFormatted);
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
            const children = Object.values(node.children).flatMap(
                convertToArray,
            );
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
            Object.entries(groupedSubtotals).forEach(
                ([key, levelSubtotals]) => {
                    const subtotalDimensionNames = key.split(':');
                    levelSubtotals.forEach((subtotalValueObject) => {
                        let parent = rootTreemapNode;
                        const subtotalDimensionValues =
                            subtotalDimensionNames.map(
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
                },
            );
        }
        return convertToArray(rootTreemapNode)[0].children || [];
    }, [
        resultsData,
        groupFieldIds,
        selectedSizeMetric,
        sizeMetricId,
        colorMetricId,
        groupedSubtotals,
    ]);

    const validConfig: TreemapChart = useMemo(() => {
        return {
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
        };
    }, [
        visibleMin,
        leafDepth,
        groupFieldIds,
        sizeMetricId,
        useDynamicColors,
        colorMetricId,
        startColor,
        endColor,
        startColorThreshold,
        endColorThreshold,
    ]);

    return {
        validConfig,

        groupFieldIds: Array.from(groupFieldIds),
        groupReorder: handleGroupReorder,

        selectedSizeMetric,
        sizeMetricId,
        sizeMetricChange: setSizeMetricId,

        selectedColorMetric,
        colorMetricId,
        colorMetricChange: setColorMetricId,

        useDynamicColors,
        toggleDynamicColors,
        startColor,
        endColor,
        onStartColorChange,
        onEndColorChange,
        startColorThreshold,
        setStartColorThreshold,
        endColorThreshold,
        setEndColorThreshold,

        visibleMin,
        setVisibleMin,
        leafDepth,
        setLeafDepth,

        data: data,
    };
};

export default useTreemapChartConfig;
