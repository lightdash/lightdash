import { type ConditionalFormattingConfig } from '@lightdash/common';
import { useCallback, useMemo } from 'react';
import {
    useVisualizationInputs,
    useVisualizationInputSelector,
} from '../components/LightdashVisualization/useVisualizationContext';
import {
    bigNumberEditorActions,
    selectBigNumberEditor,
    selectBigNumberModel,
    selectBigNumberSelectedField,
    selectBigNumberValidConfig,
    useEditorFieldSetter,
    useVisualizationDispatch,
    useVisualizationSelector,
    type BigNumberEditorState,
} from '../features/visualization/store';

type Setter<K extends keyof BigNumberEditorState> = (
    value: BigNumberEditorState[K],
) => void;

export type BigNumberEditorActions = {
    setSelectedField: Setter<'selectedField'>;
    setBigNumberLabel: Setter<'bigNumberLabel'>;
    setBigNumberComparisonStyle: Setter<'bigNumberComparisonStyle'>;
    setComparisonFormat: Setter<'comparisonFormat'>;
    setComparisonLabel: Setter<'comparisonLabel'>;
    setComparisonField: Setter<'comparisonField'>;
    styleChange: (style: BigNumberEditorState['bigNumberStyle']) => void;
    toggleShowBigNumberLabel: () => void;
    toggleShowTableNamesInLabel: () => void;
    toggleShowComparison: () => void;
    toggleFlipColors: () => void;
    conditionalFormattingAdd: (config: ConditionalFormattingConfig) => void;
    conditionalFormattingRemove: (index: number) => void;
    conditionalFormattingChange: (
        index: number,
        config: ConditionalFormattingConfig,
    ) => void;
};

/** Stable big number editor actions */
export const useBigNumberEditorActions = (): BigNumberEditorActions => {
    const dispatch = useVisualizationDispatch();
    const set = useEditorFieldSetter<BigNumberEditorState>(
        bigNumberEditorActions.set,
    );
    return useMemo(
        () => ({
            setSelectedField: (value) => set('selectedField', value),
            setBigNumberLabel: (value) => set('bigNumberLabel', value),
            setBigNumberComparisonStyle: (value) =>
                set('bigNumberComparisonStyle', value),
            setComparisonFormat: (value) => set('comparisonFormat', value),
            setComparisonLabel: (value) => set('comparisonLabel', value),
            setComparisonField: (value) => set('comparisonField', value),
            styleChange: (style) =>
                dispatch(bigNumberEditorActions.styleChange(style)),
            toggleShowBigNumberLabel: () =>
                dispatch(bigNumberEditorActions.toggleShowBigNumberLabel()),
            toggleShowTableNamesInLabel: () =>
                dispatch(bigNumberEditorActions.toggleShowTableNamesInLabel()),
            toggleShowComparison: () =>
                dispatch(bigNumberEditorActions.toggleShowComparison()),
            toggleFlipColors: () =>
                dispatch(bigNumberEditorActions.toggleFlipColors()),
            conditionalFormattingAdd: (config) =>
                dispatch(
                    bigNumberEditorActions.conditionalFormattingAdd(config),
                ),
            conditionalFormattingRemove: (index) =>
                dispatch(
                    bigNumberEditorActions.conditionalFormattingRemove(index),
                ),
            conditionalFormattingChange: (index, config) =>
                dispatch(
                    bigNumberEditorActions.conditionalFormattingChange({
                        index,
                        config,
                    }),
                ),
        }),
        [dispatch, set],
    );
};

/**
 * Everything the big number body and context menu read, re-rendering on
 * every edit. Config panels select the fields they show instead.
 */
const useBigNumberConfig = () => {
    const { itemsMap } = useVisualizationInputs();
    const editor = useVisualizationSelector(selectBigNumberEditor);
    const selectedField = useVisualizationInputSelector(
        selectBigNumberSelectedField,
    );
    const validConfig = useVisualizationInputSelector(
        selectBigNumberValidConfig,
    );
    const model = useVisualizationInputSelector(selectBigNumberModel);
    const actions = useBigNumberEditorActions();

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
            bigNumber: model.value,
            bigNumberLabel: editor.bigNumberLabel,
            resolvedBigNumberLabel: model.resolvedLabel,
            defaultLabel: model.defaultLabel,
            validConfig,
            bigNumberStyle: editor.bigNumberStyle,
            bigNumberComparisonStyle: editor.bigNumberComparisonStyle,
            showStyle: model.showStyle,
            selectedField,
            getField,
            comparisonValue: model.comparison.formattedValue,
            showBigNumberLabel: editor.showBigNumberLabel,
            showComparison: editor.showComparison,
            comparisonFormat: editor.comparisonFormat,
            comparisonDiff: model.comparison.direction,
            flipColors: editor.flipColors,
            comparisonTooltip: model.comparison.tooltip,
            comparisonLabel: editor.comparisonLabel,
            resolvedComparisonLabel: model.comparison.label,
            showTableNamesInLabel: editor.showTableNamesInLabel,
            conditionalFormattings: editor.conditionalFormattings,
            bigNumberTextColor: model.valueColor,
            comparisonField: editor.comparisonField,
            granularityFields: model.granularityFields,
        }),
        [actions, model, editor, validConfig, selectedField, getField],
    );
};

export default useBigNumberConfig;
