import {
    type BigNumber,
    type ItemsMap,
    type ParametersValuesMap,
    type TableCalculationMetadata,
} from '@lightdash/common';
import {
    buildBigNumberModel,
    getAvailableBigNumberFieldIds,
    resolveBigNumberSelectedField,
} from '@lightdash/visualization/editor';
import { useCallback, useEffect, useMemo, type SetStateAction } from 'react';
import {
    bigNumberEditorActions,
    buildBigNumberEditorState,
    selectBigNumberEditor,
    useEditorFieldSetter,
    useEditorState,
    useVisualizationDispatch,
    type BigNumberEditorState,
} from '../features/visualization/store';
import { type InfiniteQueryResults } from './useQueryResults';

const useBigNumberConfig = (
    bigNumberConfigData: BigNumber | undefined,
    resultsData:
        | (InfiniteQueryResults & { resolvedTimezone?: string })
        | undefined,
    itemsMap: ItemsMap | undefined,
    tableCalculationsMetadata?: TableCalculationMetadata[],
    parameters?: ParametersValuesMap,
) => {
    const availableFieldsIds = useMemo(
        () => getAvailableBigNumberFieldIds(itemsMap),
        [itemsMap],
    );

    const {
        selectedField,
        showTableNamesInLabel,
        bigNumberLabel,
        showBigNumberLabel,
        bigNumberStyle,
        bigNumberComparisonStyle,
        showComparison,
        comparisonFormat,
        flipColors,
        comparisonLabel,
        comparisonField,
        conditionalFormattings,
    } = useEditorState(selectBigNumberEditor, bigNumberEditorActions, () =>
        buildBigNumberEditorState(bigNumberConfigData),
    );
    const dispatch = useVisualizationDispatch();
    const set = useEditorFieldSetter<BigNumberEditorState>(
        selectBigNumberEditor,
        bigNumberEditorActions.set,
    );

    const getField = useCallback(
        (fieldNameOrId: string | undefined) => {
            if (!fieldNameOrId || !itemsMap) return;
            return itemsMap[fieldNameOrId];
        },
        [itemsMap],
    );

    useEffect(() => {
        if (itemsMap && availableFieldsIds.length > 0 && bigNumberConfigData) {
            const nextSelectedField = resolveBigNumberSelectedField({
                selectedField,
                configSelectedField: bigNumberConfigData?.selectedField,
                itemsMap,
                availableFieldsIds,
                tableCalculationsMetadata,
            });
            if (nextSelectedField !== undefined) {
                set('selectedField', nextSelectedField);
            }
        }
    }, [
        itemsMap,
        bigNumberConfigData,
        selectedField,
        availableFieldsIds,
        tableCalculationsMetadata,
        set,
    ]);

    useEffect(() => {
        dispatch(bigNumberEditorActions.syncFromConfig(bigNumberConfigData));
    }, [bigNumberConfigData, dispatch]);

    const setters = useMemo(
        () => ({
            setSelectedField: (
                value: SetStateAction<BigNumberEditorState['selectedField']>,
            ) => set('selectedField', value),
            setBigNumberLabel: (
                value: SetStateAction<BigNumberEditorState['bigNumberLabel']>,
            ) => set('bigNumberLabel', value),
            setBigNumberStyle: (
                value: SetStateAction<BigNumberEditorState['bigNumberStyle']>,
            ) => set('bigNumberStyle', value),
            setBigNumberComparisonStyle: (
                value: SetStateAction<
                    BigNumberEditorState['bigNumberComparisonStyle']
                >,
            ) => set('bigNumberComparisonStyle', value),
            setShowBigNumberLabel: (
                value: SetStateAction<
                    BigNumberEditorState['showBigNumberLabel']
                >,
            ) => set('showBigNumberLabel', value),
            setShowComparison: (
                value: SetStateAction<BigNumberEditorState['showComparison']>,
            ) => set('showComparison', value),
            setComparisonFormat: (
                value: SetStateAction<BigNumberEditorState['comparisonFormat']>,
            ) => set('comparisonFormat', value),
            setFlipColors: (
                value: SetStateAction<BigNumberEditorState['flipColors']>,
            ) => set('flipColors', value),
            setComparisonLabel: (
                value: SetStateAction<BigNumberEditorState['comparisonLabel']>,
            ) => set('comparisonLabel', value),
            setShowTableNamesInLabel: (
                value: SetStateAction<
                    BigNumberEditorState['showTableNamesInLabel']
                >,
            ) => set('showTableNamesInLabel', value),
            onSetConditionalFormattings: (
                value: SetStateAction<
                    BigNumberEditorState['conditionalFormattings']
                >,
            ) => set('conditionalFormattings', value),
            setComparisonField: (
                value: SetStateAction<BigNumberEditorState['comparisonField']>,
            ) => set('comparisonField', value),
        }),
        [set],
    );

    const validConfig: BigNumber = useMemo(() => {
        return {
            label: bigNumberLabel,
            style: bigNumberStyle,
            selectedField: selectedField,
            showBigNumberLabel,
            showTableNamesInLabel,
            showComparison,
            comparisonFormat,
            flipColors,
            comparisonLabel,
            conditionalFormattings,
            comparisonField,
        };
    }, [
        bigNumberLabel,
        bigNumberStyle,
        selectedField,
        showBigNumberLabel,
        showTableNamesInLabel,
        showComparison,
        comparisonFormat,
        flipColors,
        comparisonLabel,
        conditionalFormattings,
        comparisonField,
    ]);

    const model = useMemo(
        () =>
            buildBigNumberModel({
                resultsData,
                itemsMap,
                parameters,
                chartConfig: validConfig,
                comparisonStyle: bigNumberComparisonStyle,
            }),
        [
            resultsData,
            itemsMap,
            parameters,
            validConfig,
            bigNumberComparisonStyle,
        ],
    );

    return useMemo(
        () => ({
            bigNumber: model.value,
            bigNumberLabel,
            resolvedBigNumberLabel: model.resolvedLabel,
            defaultLabel: model.defaultLabel,
            validConfig,
            bigNumberStyle,
            bigNumberComparisonStyle,
            showStyle: model.showStyle,
            selectedField,
            getField,
            comparisonValue: model.comparison.formattedValue,
            showBigNumberLabel,
            showComparison,
            comparisonFormat,
            comparisonDiff: model.comparison.direction,
            flipColors,
            comparisonTooltip: model.comparison.tooltip,
            comparisonLabel,
            resolvedComparisonLabel: model.comparison.label,
            showTableNamesInLabel,
            conditionalFormattings,
            bigNumberTextColor: model.valueColor,
            comparisonField,
            granularityFields: model.granularityFields,
            ...setters,
        }),
        [
            model,
            bigNumberLabel,
            validConfig,
            bigNumberStyle,
            bigNumberComparisonStyle,
            selectedField,
            getField,
            showBigNumberLabel,
            showComparison,
            comparisonFormat,
            flipColors,
            comparisonLabel,
            showTableNamesInLabel,
            conditionalFormattings,
            comparisonField,
            setters,
        ],
    );
};

export default useBigNumberConfig;
