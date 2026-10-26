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
    repairTreemapSizeMetricId,
    type TreemapNode,
} from '@lightdash/visualization/editor';
import isEqual from 'lodash/isEqual';
import { useEffect, useMemo } from 'react';
import {
    buildTreemapEditorState,
    selectTreemapEditor,
    treemapEditorActions,
    useEditorFieldSetter,
    useVisualizationDispatch,
    type TreemapEditorState,
    useVisualizationSelector,
} from '../features/visualization/store';
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

    const dimensionIds = useMemo(() => Object.keys(dimensions), [dimensions]);

    const validGroupFieldIds = useMemo(
        () =>
            getValidTreemapGroupFieldIds(
                treemapConfig?.groupFieldIds,
                dimensionIds,
            ),
        [treemapConfig?.groupFieldIds, dimensionIds],
    );

    const {
        visibleMin,
        leafDepth,
        groupFieldIds,
        sizeMetricId,
        colorMetricId,
        startColor,
        endColor,
        useDynamicColors,
        startColorThreshold,
        endColorThreshold,
    } = useVisualizationSelector(selectTreemapEditor);
    const dispatch = useVisualizationDispatch();
    const set = useEditorFieldSetter<TreemapEditorState>(
        selectTreemapEditor,
        treemapEditorActions.set,
    );

    const setters = useMemo(
        () => ({
            sizeMetricChange: (value: string | null) =>
                set('sizeMetricId', value),
            colorMetricChange: (value: string | null) =>
                set('colorMetricId', value),
            toggleDynamicColors: () =>
                dispatch(treemapEditorActions.toggleDynamicColors()),
            onStartColorChange: (color: string) => set('startColor', color),
            onEndColorChange: (color: string) => set('endColor', color),
            setStartColorThreshold: (value: number | undefined) =>
                set('startColorThreshold', value),
            setEndColorThreshold: (value: number | undefined) =>
                set('endColorThreshold', value),
            setVisibleMin: (value: number) => set('visibleMin', value),
            setLeafDepth: (value: number) => set('leafDepth', value),
            groupReorder: (args: { from: number; to: number }) =>
                dispatch(treemapEditorActions.groupReorder(args)),
        }),
        [dispatch, set],
    );

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
        if (isEqual(validGroupFieldIds, groupFieldIds)) return;
        set('groupFieldIds', validGroupFieldIds);
    }, [validGroupFieldIds, groupFieldIds, set]);

    useEffect(() => {
        const repairedSizeMetricId = repairTreemapSizeMetricId({
            sizeMetricId,
            allNumericMetricIds,
            isLoading,
            tableCalculationsMetadata,
        });
        if (repairedSizeMetricId === undefined) return;
        set('sizeMetricId', repairedSizeMetricId);
    }, [
        allNumericMetricIds,
        isLoading,
        sizeMetricId,
        tableCalculationsMetadata,
        set,
    ]);

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

    const groupFieldIdsCopy = useMemo(
        () => Array.from(groupFieldIds),
        [groupFieldIds],
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

    return useMemo(
        () => ({
            validConfig,
            isLoadingSubtotals,
            subtotalsError,

            groupFieldIds: groupFieldIdsCopy,

            selectedSizeMetric,
            sizeMetricId,

            selectedColorMetric,
            colorMetricId,

            useDynamicColors,
            startColor,
            endColor,
            startColorThreshold,
            endColorThreshold,

            visibleMin,
            leafDepth,

            data,
            ...setters,
        }),
        [
            validConfig,
            isLoadingSubtotals,
            subtotalsError,
            groupFieldIdsCopy,
            selectedSizeMetric,
            sizeMetricId,
            selectedColorMetric,
            colorMetricId,
            useDynamicColors,
            startColor,
            endColor,
            startColorThreshold,
            endColorThreshold,
            visibleMin,
            leafDepth,
            data,
            setters,
        ],
    );
};

export default useTreemapChartConfig;
