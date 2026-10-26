import {
    type FunnelChart,
    type FunnelChartDataInput,
    type FunnelChartLegendPosition,
    type Metric,
    type TableCalculation,
} from '@lightdash/common';
import { type FunnelSeriesDataPoint } from '@lightdash/visualization/editor';
import { useMemo } from 'react';
import { useVisualizationInputSelector } from '../components/LightdashVisualization/useVisualizationContext';
import {
    funnelEditorActions,
    selectFunnelColorDefaults,
    selectFunnelData,
    selectFunnelEditor,
    selectFunnelFieldId,
    selectFunnelMaxValue,
    selectFunnelSelectedField,
    selectFunnelValidConfig,
    useEditorFieldSetter,
    useVisualizationDispatch,
    useVisualizationSelector,
    type FunnelEditorState,
} from '../features/visualization/store';

export type FunnelEditorActions = {
    onFieldChange: (fieldId: string | null) => void;
    setDataInput: (dataInput: FunnelChartDataInput) => void;
    onLabelsChange: (newLabel: FunnelChart['labels']) => void;
    onLabelOverridesChange: (key: string, value: string) => void;
    onColorOverridesChange: (key: string, value: string) => void;
    toggleShowLegend: () => void;
    legendPositionChange: (position: FunnelChartLegendPosition) => void;
};

/** Stable funnel editor actions */
export const useFunnelEditorActions = (): FunnelEditorActions => {
    const dispatch = useVisualizationDispatch();
    const set = useEditorFieldSetter<FunnelEditorState>(
        selectFunnelEditor,
        funnelEditorActions.set,
    );
    return useMemo(
        () => ({
            onFieldChange: (fieldId) => set('fieldId', fieldId),
            setDataInput: (dataInput) => set('dataInput', dataInput),
            onLabelsChange: (labels) =>
                dispatch(funnelEditorActions.labelsMerge(labels)),
            onLabelOverridesChange: (key, value) =>
                dispatch(
                    funnelEditorActions.labelOverrideChange({ key, value }),
                ),
            onColorOverridesChange: (key, value) =>
                dispatch(
                    funnelEditorActions.colorOverrideChange({ key, value }),
                ),
            toggleShowLegend: () =>
                dispatch(funnelEditorActions.toggleShowLegend()),
            legendPositionChange: (position) => set('legendPosition', position),
        }),
        [dispatch, set],
    );
};

export type FunnelChartConfig = FunnelEditorActions & {
    validConfig: FunnelChart;
    fieldId: string | null;
    maxValue: number;
    selectedField: Metric | TableCalculation | undefined;
    dataInput: FunnelChartDataInput;
    labels: FunnelChart['labels'];
    labelOverrides: Record<string, string>;
    colorDefaults: Record<string, string>;
    colorOverrides: Record<string, string>;
    showLegend: boolean;
    legendPosition: FunnelChartLegendPosition;
    data: FunnelSeriesDataPoint[];
};

/**
 * Everything the funnel body and context menu read, re-rendering on every
 * edit. Config panels select the fields they show instead.
 */
const useFunnelChartConfig = (): FunnelChartConfig => {
    const editor = useVisualizationSelector(selectFunnelEditor);
    const fieldId = useVisualizationInputSelector(selectFunnelFieldId);
    const selectedField = useVisualizationInputSelector(
        selectFunnelSelectedField,
    );
    const data = useVisualizationInputSelector(selectFunnelData);
    const maxValue = useVisualizationInputSelector(selectFunnelMaxValue);
    const colorDefaults = useVisualizationInputSelector(
        selectFunnelColorDefaults,
    );
    const validConfig = useVisualizationInputSelector(selectFunnelValidConfig);
    const actions = useFunnelEditorActions();

    return useMemo(
        () => ({
            ...actions,
            validConfig,
            fieldId,
            maxValue,
            selectedField,
            dataInput: editor.dataInput,
            labels: editor.labels,
            labelOverrides: editor.labelOverrides,
            colorDefaults,
            colorOverrides: editor.colorOverrides,
            showLegend: editor.showLegend,
            legendPosition: editor.legendPosition,
            data,
        }),
        [
            actions,
            validConfig,
            fieldId,
            maxValue,
            selectedField,
            editor,
            colorDefaults,
            data,
        ],
    );
};

export default useFunnelChartConfig;
