import type {
    ApiError,
    CustomDimension,
    Dimension,
    ItemsMap,
    Metric,
    MetricQuery,
    TableCalculation,
    TableCalculationMetadata,
    TreemapChart,
} from '@lightdash/common';
import {
    buildTreemapData,
    getTreemapMetricItem,
    getValidTreemapGroupFieldIds,
    reorderTreemapGroupFieldIds,
    repairTreemapSizeMetricId,
    TREEMAP_DEFAULT_END_COLOR,
    TREEMAP_DEFAULT_LEAF_DEPTH,
    TREEMAP_DEFAULT_START_COLOR,
    TREEMAP_DEFAULT_VISIBLE_MIN,
    type TreemapNode,
} from '@lightdash/visualization/editor';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAsyncCalculateSubtotals } from './useAsyncCalculateTotal';
import { useProjectUuid } from './useProjectUuid';
import { type InfiniteQueryResults } from './useQueryResults';

type TreemapChartConfig = {
    validConfig: TreemapChart;
    isLoadingSubtotals: boolean;
    subtotalsError: ApiError | null;

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
    setStartColorThreshold: (startColorThreshold: number | undefined) => void;
    endColorThreshold?: number;
    setEndColorThreshold: (endColorThreshold: number | undefined) => void;

    visibleMin: number;
    setVisibleMin: (visibleMin: number) => void;
    leafDepth: number;
    setLeafDepth: (leafDepth: number) => void;

    data: TreemapNode[];
};

export type TreemapChartConfigFn = (
    treemapConfig: TreemapChart | undefined,
    resultsData:
        | (InfiniteQueryResults & {
              metricQuery?: MetricQuery;
              fields?: ItemsMap;
              resolvedTimezone?: string;
          })
        | undefined,
    itemsMap: ItemsMap | undefined,
    dimensions: Record<string, CustomDimension | Dimension>,
    numericMetrics: Record<string, Metric | TableCalculation>,
    tableCalculationsMetadata?: TableCalculationMetadata[],
) => TreemapChartConfig;

/**
 * The treemap editor state. Defaults, field validation and the tree itself
 * come from `@lightdash/visualization`; this hook holds the editor state
 * and its mutators, and fetches the subtotals the tree's parent nodes need.
 */
const useTreemapChartConfig: TreemapChartConfigFn = (
    treemapConfig,
    resultsData,
    itemsMap,
    dimensions,
    numericMetrics,
    tableCalculationsMetadata,
) => {
    const projectUuid = useProjectUuid();

    const [visibleMin, setVisibleMin] = useState(
        treemapConfig?.visibleMin ?? TREEMAP_DEFAULT_VISIBLE_MIN,
    );
    const [leafDepth, setLeafDepth] = useState(
        treemapConfig?.leafDepth ?? TREEMAP_DEFAULT_LEAF_DEPTH,
    );

    const dimensionIds = useMemo(() => Object.keys(dimensions), [dimensions]);

    const validGroupFieldIds = useMemo(
        () =>
            getValidTreemapGroupFieldIds(
                treemapConfig?.groupFieldIds,
                dimensionIds,
            ),
        [treemapConfig?.groupFieldIds, dimensionIds],
    );

    const [groupFieldIds, setGroupFieldIds] = useState(validGroupFieldIds);

    const [sizeMetricId, setSizeMetricId] = useState(
        treemapConfig?.sizeMetricId ?? null,
    );
    const [colorMetricId, setColorMetricId] = useState(
        treemapConfig?.colorMetricId ?? null,
    );
    const [startColor, onStartColorChange] = useState(
        treemapConfig?.startColor ?? TREEMAP_DEFAULT_START_COLOR,
    );
    const [endColor, onEndColorChange] = useState(
        treemapConfig?.endColor ?? TREEMAP_DEFAULT_END_COLOR,
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

    const selectedSizeMetric = useMemo(
        () => getTreemapMetricItem(itemsMap, sizeMetricId),
        [itemsMap, sizeMetricId],
    );

    const selectedColorMetric = useMemo(
        () => getTreemapMetricItem(itemsMap, colorMetricId),
        [itemsMap, colorMetricId],
    );

    const isLoading = !resultsData;

    useEffect(() => {
        setGroupFieldIds(validGroupFieldIds);
    }, [validGroupFieldIds]);

    useEffect(() => {
        const repairedSizeMetricId = repairTreemapSizeMetricId({
            sizeMetricId,
            allNumericMetricIds,
            isLoading,
            tableCalculationsMetadata,
        });
        if (repairedSizeMetricId === undefined) return;
        setSizeMetricId(repairedSizeMetricId);
    }, [
        allNumericMetricIds,
        isLoading,
        sizeMetricId,
        tableCalculationsMetadata,
    ]);

    const handleGroupReorder = useCallback(
        ({ from, to }: { from: number; to: number }) => {
            setGroupFieldIds((prev) =>
                reorderTreemapGroupFieldIds(prev, { from, to }),
            );
        },
        [],
    );

    const {
        data: groupedSubtotals,
        isFetching: isLoadingSubtotals,
        error: subtotalsError,
    } = useAsyncCalculateSubtotals({
        projectUuid,
        sourceQueryUuid: resultsData?.queryUuid,
        dimensions: resultsData?.metricQuery?.dimensions,
        columnOrder: groupFieldIds.filter((id): id is string => id !== null),
        pivotDimensions: undefined,
        enabled: true,
        invalidateCache: undefined,
    });

    const data = useMemo(
        () =>
            buildTreemapData({
                resultsData,
                sizeMetricId,
                selectedSizeMetric,
                colorMetricId,
                groupFieldIds,
                groupedSubtotals,
            }),
        [
            resultsData,
            groupFieldIds,
            selectedSizeMetric,
            sizeMetricId,
            colorMetricId,
            groupedSubtotals,
        ],
    );

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
        isLoadingSubtotals,
        subtotalsError,

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
