import { ChartType, type GaugeSection } from '@lightdash/common';
import { useMemo } from 'react';
import { useVisualizationInputSelector } from '../components/LightdashVisualization/useVisualizationContext';
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
    updateSection: (
        section: GaugeSection,
        changes: Partial<GaugeSection>,
    ) => void;
};

/** Stable gauge editor actions */
export const useGaugeEditorActions = (): GaugeEditorActions => {
    const dispatch = useVisualizationDispatch();
    const set = useEditorFieldSetter<GaugeEditorState>(gaugeEditorActions.set);
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
            updateSection: (target, changes) =>
                dispatch(gaugeEditorActions.updateSection({ target, changes })),
        }),
        [dispatch, set],
    );
};

/**
 * Everything the gauge chart body reads, re-rendering on every edit.
 * Config panels select the fields they show instead.
 */
const useGaugeChartConfig = () => {
    const editor = useVisualizationSelector(selectGaugeEditor);
    const selectedField = useVisualizationInputSelector(
        selectGaugeSelectedField,
    );
    const validConfig = useVisualizationInputSelector(selectGaugeValidConfig);
    const actions = useGaugeEditorActions();

    return useMemo(
        () => ({
            ...actions,
            ...editor,
            chartType: ChartType.GAUGE as const,
            validConfig,
            selectedField,
        }),
        [actions, editor, validConfig, selectedField],
    );
};

export default useGaugeChartConfig;
