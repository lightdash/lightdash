import { ChartType, type GaugeChart, type ItemsMap } from '@lightdash/common';
import {
    getAvailableGaugeFieldIds,
    getEffectiveGaugeSelectedField,
} from '@lightdash/visualization/editor';
import { useCallback, useMemo, type SetStateAction } from 'react';
import {
    buildGaugeEditorState,
    gaugeEditorActions,
    selectGaugeEditor,
    useEditorFieldSetter,
    useEditorState,
    type GaugeEditorState,
} from '../features/visualization/store';

/**
 * The explorer's editable gauge config. The derivations (available fields,
 * the effective selected field) come from `@lightdash/visualization`; the
 * editor state lives in the visualization store and this hook exposes its
 * mutators.
 */
const useGaugeChartConfig = (
    initialChartConfig: GaugeChart | undefined,
    itemsMap: ItemsMap | undefined,
) => {
    const availableFieldsIds = useMemo(
        () => getAvailableGaugeFieldIds(itemsMap),
        [itemsMap],
    );

    const {
        selectedField,
        min,
        max,
        maxFieldId,
        showAxisLabels,
        sections,
        customLabel,
        showPercentage,
        customPercentageLabel,
    } = useEditorState(selectGaugeEditor, gaugeEditorActions, () =>
        buildGaugeEditorState(initialChartConfig),
    );
    const set = useEditorFieldSetter<GaugeEditorState>(
        selectGaugeEditor,
        gaugeEditorActions.set,
    );

    // Get the effective selected field - use state value or fallback to first available
    const effectiveSelectedField = useMemo(
        () => getEffectiveGaugeSelectedField(selectedField, availableFieldsIds),
        [selectedField, availableFieldsIds],
    );

    const setters = useMemo(
        () => ({
            setSelectedField: (field: string | undefined) =>
                set('selectedField', field),
            setMin: (value: number) => set('min', value),
            setMax: (value: number) => set('max', value),
            setMaxFieldId: (value: string | undefined) =>
                set('maxFieldId', value),
            setShowAxisLabels: (value: boolean) => set('showAxisLabels', value),
            setSections: (
                value: SetStateAction<GaugeEditorState['sections']>,
            ) => set('sections', value),
            setCustomLabel: (value: string | undefined) =>
                set('customLabel', value),
            setShowPercentage: (value: boolean) => set('showPercentage', value),
            setCustomPercentageLabel: (value: string | undefined) =>
                set('customPercentageLabel', value),
        }),
        [set],
    );

    const getField = useCallback(
        (fieldNameOrId: string | undefined) => {
            if (!fieldNameOrId || !itemsMap) return;
            return itemsMap[fieldNameOrId];
        },
        [itemsMap],
    );

    const validConfig: GaugeChart = useMemo(() => {
        return {
            selectedField: effectiveSelectedField,
            min,
            max,
            maxFieldId,
            showAxisLabels,
            sections,
            customLabel,
            showPercentage,
            customPercentageLabel,
        };
    }, [
        effectiveSelectedField,
        min,
        max,
        maxFieldId,
        showAxisLabels,
        sections,
        customLabel,
        showPercentage,
        customPercentageLabel,
    ]);

    return useMemo(
        () => ({
            chartType: ChartType.GAUGE as const,
            validConfig,
            selectedField: effectiveSelectedField,
            getField,
            min,
            max,
            maxFieldId,
            showAxisLabels,
            sections,
            customLabel,
            showPercentage,
            customPercentageLabel,
            ...setters,
        }),
        [
            validConfig,
            effectiveSelectedField,
            getField,
            min,
            max,
            maxFieldId,
            showAxisLabels,
            sections,
            customLabel,
            showPercentage,
            customPercentageLabel,
            setters,
        ],
    );
};

export default useGaugeChartConfig;
