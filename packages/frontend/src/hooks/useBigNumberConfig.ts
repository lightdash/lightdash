import {
    ComparisonFormatTypes,
    type BigNumber,
    type ConditionalFormattingConfig,
    type ItemsMap,
    type ParametersValuesMap,
    type TableCalculationMetadata,
} from '@lightdash/common';
import {
    buildBigNumberModel,
    getAvailableBigNumberFieldIds,
    resolveBigNumberSelectedField,
} from '@lightdash/visualization';
import { useCallback, useEffect, useMemo, useState } from 'react';
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

    const [selectedField, setSelectedField] = useState<string | undefined>();

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
                setSelectedField(nextSelectedField);
            }
        }
    }, [
        itemsMap,
        bigNumberConfigData,
        selectedField,
        availableFieldsIds,
        tableCalculationsMetadata,
    ]);

    const [showTableNamesInLabel, setShowTableNamesInLabel] = useState<
        BigNumber['showTableNamesInLabel'] | undefined
    >(bigNumberConfigData?.showTableNamesInLabel);

    const [bigNumberLabel, setBigNumberLabel] = useState<
        BigNumber['label'] | undefined
    >(bigNumberConfigData?.label);
    const [showBigNumberLabel, setShowBigNumberLabel] = useState<
        BigNumber['showBigNumberLabel'] | undefined
    >(bigNumberConfigData?.showBigNumberLabel);
    const [bigNumberStyle, setBigNumberStyle] = useState<
        BigNumber['style'] | undefined
    >(bigNumberConfigData?.style);
    const [bigNumberComparisonStyle, setBigNumberComparisonStyle] = useState<
        BigNumber['style'] | undefined
    >(bigNumberConfigData?.style);

    const [showComparison, setShowComparison] = useState<
        BigNumber['showComparison'] | undefined
    >(bigNumberConfigData?.showComparison);
    const [comparisonFormat, setComparisonFormat] = useState<
        BigNumber['comparisonFormat'] | undefined
    >(bigNumberConfigData?.comparisonFormat);
    const [flipColors, setFlipColors] = useState<BigNumber['flipColors']>(
        bigNumberConfigData?.flipColors,
    );
    const [comparisonLabel, setComparisonLabel] = useState<
        BigNumber['comparisonLabel']
    >(bigNumberConfigData?.comparisonLabel);
    const [comparisonField, setComparisonField] = useState<
        BigNumber['comparisonField']
    >(bigNumberConfigData?.comparisonField);

    const [conditionalFormattings, setConditionalFormattings] = useState<
        ConditionalFormattingConfig[]
    >(bigNumberConfigData?.conditionalFormattings ?? []);

    useEffect(() => {
        if (bigNumberConfigData?.selectedField !== undefined)
            setSelectedField(bigNumberConfigData.selectedField);

        setBigNumberLabel(bigNumberConfigData?.label);
        setShowBigNumberLabel(bigNumberConfigData?.showBigNumberLabel ?? true);
        setShowTableNamesInLabel(
            bigNumberConfigData?.showTableNamesInLabel ?? true,
        );

        setBigNumberStyle(bigNumberConfigData?.style);
        setBigNumberComparisonStyle(bigNumberConfigData?.style);

        setShowComparison(bigNumberConfigData?.showComparison ?? false);
        setComparisonFormat(
            bigNumberConfigData?.comparisonFormat ?? ComparisonFormatTypes.RAW,
        );
        setFlipColors(bigNumberConfigData?.flipColors ?? false);
        setComparisonLabel(bigNumberConfigData?.comparisonLabel);
        setConditionalFormattings(
            bigNumberConfigData?.conditionalFormattings ?? [],
        );
        setComparisonField(bigNumberConfigData?.comparisonField);
    }, [bigNumberConfigData]);

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

    return {
        bigNumber: model.value,
        bigNumberLabel,
        resolvedBigNumberLabel: model.resolvedLabel,
        defaultLabel: model.defaultLabel,
        setBigNumberLabel,
        validConfig,
        bigNumberStyle,
        setBigNumberStyle,
        bigNumberComparisonStyle,
        setBigNumberComparisonStyle,
        showStyle: model.showStyle,
        selectedField,
        setSelectedField,
        getField,
        comparisonValue: model.comparison.formattedValue,
        showBigNumberLabel,
        setShowBigNumberLabel,
        showComparison,
        setShowComparison,
        comparisonFormat,
        setComparisonFormat,
        comparisonDiff: model.comparison.direction,
        flipColors,
        setFlipColors,
        comparisonTooltip: model.comparison.tooltip,
        comparisonLabel,
        resolvedComparisonLabel: model.comparison.label,
        setComparisonLabel,
        showTableNamesInLabel,
        setShowTableNamesInLabel,
        conditionalFormattings,
        onSetConditionalFormattings: setConditionalFormattings,
        bigNumberTextColor: model.valueColor,
        comparisonField,
        setComparisonField,
        granularityFields: model.granularityFields,
    };
};

export default useBigNumberConfig;
