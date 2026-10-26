import {
    type Metric,
    type PieChart,
    type PieChartLegendPosition,
    type PieChartValueOptions,
    type TableCalculation,
} from '@lightdash/common';
import { type PieChartDataPoint } from '@lightdash/visualization/editor';
import { useMemo } from 'react';
import {
    useVisualizationInputSelector,
    useVisualizationServices,
} from '../components/LightdashVisualization/useVisualizationContext';
import {
    pieEditorActions,
    selectPieData,
    selectPieEditor,
    selectDimensionsAndNumericMetrics,
    selectPieGroupColorDefaults,
    selectPieGroupFieldIds,
    selectPieGroupLabels,
    selectPieMetricId,
    selectPieSelectedMetric,
    selectPieSortedGroupLabels,
    selectPieValidConfig,
    selectPieValueOptionOverrideFlags,
    useEditorFieldSetter,
    useVisualizationDispatch,
    useVisualizationSelector,
    useVisualizationStore,
    type PieEditorState,
} from '../features/visualization/store';

export type PieEditorActions = {
    groupAdd: (dimensionId?: string) => void;
    groupChange: (prevDimensionId: string, newDimensionId: string) => void;
    groupRemove: (dimensionId: string) => void;
    metricChange: (metricId: string | null) => void;
    toggleDonut: () => void;
    valueLabelChange: (valueLabel: PieChartValueOptions['valueLabel']) => void;
    valueLabelColorChange: (color: string | undefined) => void;
    toggleShowValue: () => void;
    toggleShowPercentage: () => void;
    groupLabelChange: (label: string, value: string) => void;
    groupColorChange: (label: string, value: string) => void;
    groupValueOptionChange: (
        label: string,
        value: Partial<PieChartValueOptions>,
    ) => void;
    groupSortChange: (oldIndex: number, newIndex: number) => void;
    toggleShowLegend: () => void;
    legendPositionChange: (position: PieChartLegendPosition) => void;
    legendMaxItemLengthChange: (length: number | undefined) => void;
};

/** Stable pie editor actions; what they need from the results is read at call time. */
export const usePieEditorActions = (): PieEditorActions => {
    const dispatch = useVisualizationDispatch();
    const store = useVisualizationStore();
    const { getInputs } = useVisualizationServices();
    const set = useEditorFieldSetter<PieEditorState>(pieEditorActions.set);
    return useMemo(() => {
        const shownGroupFieldIds = () =>
            selectPieGroupFieldIds(store.getState(), getInputs());
        return {
            groupAdd: (dimensionId) =>
                dispatch(
                    pieEditorActions.groupAdd({
                        current: shownGroupFieldIds(),
                        dimensionId,
                        dimensionIds: Object.keys(
                            selectDimensionsAndNumericMetrics(
                                store.getState(),
                                getInputs(),
                            ).dimensions,
                        ),
                    }),
                ),
            groupChange: (prevDimensionId, newDimensionId) =>
                dispatch(
                    pieEditorActions.groupChange({
                        current: shownGroupFieldIds(),
                        prevDimensionId,
                        newDimensionId,
                    }),
                ),
            groupRemove: (dimensionId) =>
                dispatch(
                    pieEditorActions.groupRemove({
                        current: shownGroupFieldIds(),
                        dimensionId,
                    }),
                ),
            metricChange: (metricId) => set('metricId', metricId),
            toggleDonut: () => dispatch(pieEditorActions.toggleDonut()),
            valueLabelChange: (valueLabel) =>
                dispatch(pieEditorActions.valueLabelChange(valueLabel)),
            valueLabelColorChange: (color) =>
                dispatch(pieEditorActions.valueLabelColorChange(color)),
            toggleShowValue: () => dispatch(pieEditorActions.toggleShowValue()),
            toggleShowPercentage: () =>
                dispatch(pieEditorActions.toggleShowPercentage()),
            groupLabelChange: (key, value) =>
                dispatch(pieEditorActions.groupLabelChange({ key, value })),
            groupColorChange: (key, value) =>
                dispatch(pieEditorActions.groupColorChange({ key, value })),
            groupValueOptionChange: (label, value) =>
                dispatch(
                    pieEditorActions.groupValueOptionChange({ label, value }),
                ),
            groupSortChange: (oldIndex, newIndex) =>
                dispatch(
                    pieEditorActions.groupSortChange({
                        oldIndex,
                        newIndex,
                        groupLabels: selectPieGroupLabels(
                            store.getState(),
                            getInputs(),
                        ),
                    }),
                ),
            toggleShowLegend: () =>
                dispatch(pieEditorActions.toggleShowLegend()),
            legendPositionChange: (position) => set('legendPosition', position),
            legendMaxItemLengthChange: (length) =>
                set('legendMaxItemLength', length),
        };
    }, [dispatch, store, getInputs, set]);
};

export type PieChartConfig = PieEditorActions & {
    validConfig: PieChart;
    groupFieldIds: string[];
    metricId: string | null;
    selectedMetric: Metric | TableCalculation | undefined;
    isDonut: boolean;
    valueLabel: PieChartValueOptions['valueLabel'];
    valueLabelColor: PieChartValueOptions['valueLabelColor'];
    showValue: PieChartValueOptions['showValue'];
    showPercentage: PieChartValueOptions['showPercentage'];
    isValueLabelOverriden: boolean;
    isShowValueOverriden: boolean;
    isShowPercentageOverriden: boolean;
    sortedGroupLabels: string[];
    groupLabelOverrides: Record<string, string>;
    groupColorOverrides: Record<string, string>;
    groupColorDefaults: Record<string, string>;
    groupValueOptionOverrides: Record<string, Partial<PieChartValueOptions>>;
    groupSortOverrides: string[];
    showLegend: boolean;
    legendPosition: PieChartLegendPosition;
    legendMaxItemLength: number | undefined;
    data: PieChartDataPoint[];
};

/** Everything the pie chart body and context menu reads, re-rendering on every edit; config panels select their own fields */
const usePieChartConfig = (): PieChartConfig => {
    const editor = useVisualizationSelector(selectPieEditor);
    const groupFieldIds = useVisualizationInputSelector(selectPieGroupFieldIds);
    const metricId = useVisualizationInputSelector(selectPieMetricId);
    const selectedMetric = useVisualizationInputSelector(
        selectPieSelectedMetric,
    );
    const data = useVisualizationInputSelector(selectPieData);
    const sortedGroupLabels = useVisualizationInputSelector(
        selectPieSortedGroupLabels,
    );
    const groupColorDefaults = useVisualizationInputSelector(
        selectPieGroupColorDefaults,
    );
    const overrideFlags = useVisualizationInputSelector(
        selectPieValueOptionOverrideFlags,
    );
    const validConfig = useVisualizationInputSelector(selectPieValidConfig);
    const actions = usePieEditorActions();

    return useMemo(
        () => ({
            ...actions,
            ...overrideFlags,
            validConfig,
            groupFieldIds,
            metricId,
            selectedMetric,
            isDonut: editor.isDonut,
            valueLabel: editor.valueLabel,
            valueLabelColor: editor.valueLabelColor,
            showValue: editor.showValue,
            showPercentage: editor.showPercentage,
            sortedGroupLabels,
            groupLabelOverrides: editor.groupLabelOverrides,
            groupColorOverrides: editor.groupColorOverrides,
            groupColorDefaults,
            groupValueOptionOverrides: editor.groupValueOptionOverrides,
            groupSortOverrides: editor.groupSortOverrides,
            showLegend: editor.showLegend,
            legendPosition: editor.legendPosition,
            legendMaxItemLength: editor.legendMaxItemLength,
            data,
        }),
        [
            actions,
            overrideFlags,
            validConfig,
            groupFieldIds,
            metricId,
            selectedMetric,
            editor,
            sortedGroupLabels,
            groupColorDefaults,
            data,
        ],
    );
};

export default usePieChartConfig;
