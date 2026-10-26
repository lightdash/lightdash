import {
    type ApiError,
    type Metric,
    type TableCalculation,
    type TreemapChart,
} from '@lightdash/common';
import {
    buildTreemapData,
    type TreemapNode,
} from '@lightdash/visualization/editor';
import { useMemo } from 'react';
import {
    useVisualizationInputs,
    useVisualizationInputSelector,
    useVisualizationInputsRef,
} from '../components/LightdashVisualization/useVisualizationContext';
import {
    selectTreemapEditor,
    selectTreemapGroupFieldIds,
    selectTreemapSelectedColorMetric,
    selectTreemapSelectedSizeMetric,
    selectTreemapSizeMetricId,
    selectTreemapValidConfig,
    treemapEditorActions,
    useEditorFieldSetter,
    useVisualizationDispatch,
    useVisualizationSelector,
    useVisualizationStore,
    type TreemapEditorState,
} from '../features/visualization/store';
import { useAsyncCalculateSubtotals } from './useAsyncCalculateTotal';
import { useProjectUuid } from './useProjectUuid';

export type TreemapEditorActions = {
    groupReorder: (args: { from: number; to: number }) => void;
    sizeMetricChange: (sizeMetricId: string | null) => void;
    colorMetricChange: (colorMetricId: string | null) => void;
    toggleDynamicColors: () => void;
    onStartColorChange: (color: string) => void;
    onEndColorChange: (color: string) => void;
    setStartColorThreshold: (startColorThreshold: number | undefined) => void;
    setEndColorThreshold: (endColorThreshold: number | undefined) => void;
    setVisibleMin: (visibleMin: number) => void;
    setLeafDepth: (leafDepth: number) => void;
};

/** Stable treemap editor actions; the displayed group order is read at call time. */
export const useTreemapEditorActions = (): TreemapEditorActions => {
    const dispatch = useVisualizationDispatch();
    const store = useVisualizationStore();
    const inputsRef = useVisualizationInputsRef();
    const set = useEditorFieldSetter<TreemapEditorState>(
        treemapEditorActions.set,
    );
    return useMemo(
        () => ({
            groupReorder: ({ from, to }) =>
                dispatch(
                    treemapEditorActions.groupReorder({
                        from,
                        to,
                        groupFieldIds: selectTreemapGroupFieldIds(
                            store.getState(),
                            inputsRef.current,
                        ),
                    }),
                ),
            sizeMetricChange: (value) => set('sizeMetricId', value),
            colorMetricChange: (value) => set('colorMetricId', value),
            toggleDynamicColors: () =>
                dispatch(treemapEditorActions.toggleDynamicColors()),
            onStartColorChange: (color) => set('startColor', color),
            onEndColorChange: (color) => set('endColor', color),
            setStartColorThreshold: (value) =>
                set('startColorThreshold', value),
            setEndColorThreshold: (value) => set('endColorThreshold', value),
            setVisibleMin: (value) => set('visibleMin', value),
            setLeafDepth: (value) => set('leafDepth', value),
        }),
        [dispatch, store, inputsRef, set],
    );
};

export type TreemapChartConfig = TreemapEditorActions & {
    validConfig: TreemapChart;
    isLoadingSubtotals: boolean;
    subtotalsError: ApiError | null;
    groupFieldIds: string[];
    sizeMetricId: string | null;
    selectedSizeMetric: Metric | TableCalculation | undefined;
    colorMetricId: string | null;
    selectedColorMetric: Metric | TableCalculation | undefined;
    useDynamicColors: boolean;
    startColor: string;
    endColor: string;
    startColorThreshold: number | undefined;
    endColorThreshold: number | undefined;
    visibleMin: number;
    leafDepth: number;
    data: TreemapNode[];
};

/**
 * Everything the treemap chart body reads, re-rendering on every edit.
 * Config panels select the fields they show instead. The subtotals the
 * parent nodes need are server state, so they are fetched here.
 */
const useTreemapChartConfig = (): TreemapChartConfig => {
    const projectUuid = useProjectUuid();
    const { resultsData } = useVisualizationInputs();
    const editor = useVisualizationSelector(selectTreemapEditor);
    const groupFieldIds = useVisualizationInputSelector(
        selectTreemapGroupFieldIds,
    );
    const sizeMetricId = useVisualizationInputSelector(
        selectTreemapSizeMetricId,
    );
    const selectedSizeMetric = useVisualizationInputSelector(
        selectTreemapSelectedSizeMetric,
    );
    const selectedColorMetric = useVisualizationInputSelector(
        selectTreemapSelectedColorMetric,
    );
    const validConfig = useVisualizationInputSelector(selectTreemapValidConfig);
    const actions = useTreemapEditorActions();

    const {
        data: groupedSubtotals,
        isFetching: isLoadingSubtotals,
        error: subtotalsError,
    } = useAsyncCalculateSubtotals({
        projectUuid,
        sourceQueryUuid: resultsData?.queryUuid,
        dimensions: resultsData?.metricQuery?.dimensions,
        columnOrder: groupFieldIds,
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
                colorMetricId: editor.colorMetricId,
                groupFieldIds,
                groupedSubtotals,
            }),
        [
            resultsData,
            sizeMetricId,
            selectedSizeMetric,
            editor.colorMetricId,
            groupFieldIds,
            groupedSubtotals,
        ],
    );

    return useMemo(
        () => ({
            ...actions,
            validConfig,
            isLoadingSubtotals,
            subtotalsError,
            groupFieldIds,
            sizeMetricId,
            selectedSizeMetric,
            colorMetricId: editor.colorMetricId,
            selectedColorMetric,
            useDynamicColors: editor.useDynamicColors,
            startColor: editor.startColor,
            endColor: editor.endColor,
            startColorThreshold: editor.startColorThreshold,
            endColorThreshold: editor.endColorThreshold,
            visibleMin: editor.visibleMin,
            leafDepth: editor.leafDepth,
            data,
        }),
        [
            actions,
            validConfig,
            isLoadingSubtotals,
            subtotalsError,
            groupFieldIds,
            sizeMetricId,
            selectedSizeMetric,
            selectedColorMetric,
            editor,
            data,
        ],
    );
};

export default useTreemapChartConfig;
