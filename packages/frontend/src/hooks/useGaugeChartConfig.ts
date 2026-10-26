import { ChartType, type GaugeSection } from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import {
    useVisualizationInputs,
    useVisualizationInputSelector,
} from '../components/LightdashVisualization/useVisualizationContext';
import {
    gaugeEditorActions,
    selectGaugeEditor,
    selectGaugeSelectedField,
    selectGaugeValidConfig,
    useEditorFieldSetter,
    useVisualizationDispatch,
    useVisualizationSelector,
    type GaugeEditorState,
} from '../features/visualization/store';

export type GaugeEditorActions = {
    setSelectedField: (field: string | undefined) => void;
    setMin: (value: number) => void;
    setMax: (value: number) => void;
    setMaxFieldId: (value: string | undefined) => void;
    setShowAxisLabels: (value: boolean) => void;
    setCustomLabel: (value: string | undefined) => void;
    setShowPercentage: (value: boolean) => void;
    setCustomPercentageLabel: (value: string | undefined) => void;
    addSection: () => void;
    removeSection: (index: number) => void;
    updateSection: (index: number, section: Partial<GaugeSection>) => void;
};

/** Stable gauge editor actions */
export const useGaugeEditorActions = (): GaugeEditorActions => {
    const dispatch = useVisualizationDispatch();
    const set = useEditorFieldSetter<GaugeEditorState>(
        selectGaugeEditor,
        gaugeEditorActions.set,
    );
    return useMemo(
        () => ({
            setSelectedField: (field) => set('selectedField', field),
            setMin: (value) => set('min', value),
            setMax: (value) => set('max', value),
            setMaxFieldId: (value) => set('maxFieldId', value),
            setShowAxisLabels: (value) => set('showAxisLabels', value),
            setCustomLabel: (value) => set('customLabel', value),
            setShowPercentage: (value) => set('showPercentage', value),
            setCustomPercentageLabel: (value) =>
                set('customPercentageLabel', value),
            addSection: () => dispatch(gaugeEditorActions.addSection()),
            removeSection: (index) =>
                dispatch(gaugeEditorActions.removeSection(index)),
            updateSection: (index, section) =>
                dispatch(gaugeEditorActions.updateSection({ index, section })),
        }),
        [dispatch, set],
    );
};

/**
 * Everything the gauge chart body reads, re-rendering on every edit.
 * Config panels select the fields they show instead.
 */
const useGaugeChartConfig = () => {
    const { itemsMap } = useVisualizationInputs();
    const editor = useVisualizationSelector(selectGaugeEditor);
    const selectedField = useVisualizationInputSelector(
        selectGaugeSelectedField,
    );
    const validConfig = useVisualizationInputSelector(selectGaugeValidConfig);
    const actions = useGaugeEditorActions();

    const getField = useCallback(
        (fieldNameOrId: string | undefined) => {
            if (!fieldNameOrId || !itemsMap) return;
            return itemsMap[fieldNameOrId];
        },
        [itemsMap],
    );

    return useMemo(
        () => ({
            ...actions,
            ...editor,
            chartType: ChartType.GAUGE as const,
            validConfig,
            selectedField,
            getField,
        }),
        [actions, editor, validConfig, selectedField, getField],
    );
};

export default useGaugeChartConfig;
