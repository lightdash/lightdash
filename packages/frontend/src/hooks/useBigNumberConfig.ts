import {
    applyCustomFormat,
    ComparisonDiffTypes,
    ComparisonFormatTypes,
    CustomFormatType,
    formatItemValue,
    friendlyName,
    getCustomFormatFromLegacy,
    getItemId,
    getItemLabel,
    isField,
    isMetric,
    isNumericItem,
    isTableCalculation,
    valueIsNaN,
    type ApiQueryResults,
    type BigNumber,
    type CompactOrAlias,
    type ItemsMap,
    type TableCalculationMetadata,
} from '@lightdash/common';
import { useCallback, useEffect, useMemo, useState } from 'react';

const calculateComparisonValue = (
    a: number,
    b: number,
    format: ComparisonFormatTypes | undefined,
) => {
    const rawValue = a - b;
    switch (format) {
        case ComparisonFormatTypes.PERCENTAGE:
            return rawValue / Math.abs(b);
        case ComparisonFormatTypes.RAW:
            return rawValue;
        default:
            return rawValue;
    }
};

const NOT_APPLICABLE = 'n/a';
const UNDEFINED = 'undefined';
const formatComparisonValue = (
    format: ComparisonFormatTypes | undefined,
    comparisonDiff: ComparisonDiffTypes | undefined,
    item: ItemsMap[string] | undefined,
    value: number | string,
    bigNumberComparisonStyle: CompactOrAlias | undefined,
) => {
    const prefix =
        comparisonDiff === ComparisonDiffTypes.POSITIVE ||
        comparisonDiff === ComparisonDiffTypes.NONE
            ? '+'
            : '';
    if (value === UNDEFINED) {
        value = NOT_APPLICABLE;
    }
    switch (format) {
        case ComparisonFormatTypes.PERCENTAGE:
            return `${prefix}${applyCustomFormat(value, {
                round: 0,
                type: CustomFormatType.PERCENT,
            })}`;
        case ComparisonFormatTypes.RAW:
            if (item !== undefined && isTableCalculation(item)) {
                return `${prefix}${formatItemValue(item, value)}`;
            }
            return `${prefix}${applyCustomFormat(
                value,
                getCustomFormatFromLegacy({
                    format: isField(item) ? item.format : undefined,
                    round: bigNumberComparisonStyle
                        ? 2
                        : isField(item)
                        ? item.round
                        : undefined,
                    compact: bigNumberComparisonStyle,
                }),
            )}`;
        default:
            if (item !== undefined && isTableCalculation(item)) {
                return formatItemValue(item, value);
            }
            return applyCustomFormat(
                value,
                getCustomFormatFromLegacy({
                    format: isField(item) ? item.format : undefined,
                    round: bigNumberComparisonStyle
                        ? 2
                        : isField(item)
                        ? item.round
                        : undefined,
                    compact: bigNumberComparisonStyle,
                }),
            );
    }
};

const isNumber = (i: ItemsMap[string] | undefined, value: any) =>
    isNumericItem(i) && !(value instanceof Date) && !valueIsNaN(value);

const getItemPriority = (item: ItemsMap[string]): number => {
    if (isField(item) && isMetric(item)) {
        return 1;
    }
    if (isTableCalculation(item)) {
        return 2;
    }
    return 3;
};

const useBigNumberConfig = (
    bigNumberConfigData: BigNumber | undefined,
    resultsData: ApiQueryResults | undefined,
    itemsMap: ItemsMap | undefined,
    tableCalculationsMetadata?: TableCalculationMetadata[],
) => {
    const availableFieldsIds = useMemo(() => {
        const itemsSortedByType = Object.values(itemsMap || {}).sort((a, b) => {
            return getItemPriority(a) - getItemPriority(b);
        });
        return itemsSortedByType.map(getItemId);
    }, [itemsMap]);

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
            if (tableCalculationsMetadata) {
                /**
                 * When table calculations update, their name changes, so we need to update the selected fields
                 * If the selected field is a table calculation with the old name in the metadata, set it to the new name
                 */
                const selectedFieldTcIndex =
                    tableCalculationsMetadata.findIndex(
                        (tc) =>
                            bigNumberConfigData?.selectedField === tc.oldName,
                    );

                if (selectedFieldTcIndex !== -1) {
                    setSelectedField(
                        tableCalculationsMetadata[selectedFieldTcIndex].name,
                    );
                    return;
                }
            }

            const selectedFieldExists =
                bigNumberConfigData?.selectedField &&
                getField(bigNumberConfigData?.selectedField) !== undefined;
            const defaultSelectedField = selectedFieldExists
                ? bigNumberConfigData?.selectedField
                : availableFieldsIds[0];

            if (selectedField === undefined || selectedFieldExists === false) {
                // Set default selectedField on explore load
                // or if existing selectedField is no longer available, default to first available field
                setSelectedField(defaultSelectedField);
            }
        }
    }, [
        itemsMap,
        bigNumberConfigData,
        selectedField,
        availableFieldsIds,
        getField,
        tableCalculationsMetadata,
    ]);

    const item = useMemo(() => {
        if (!itemsMap || !selectedField) return;

        return itemsMap[selectedField];
    }, [itemsMap, selectedField]);

    const label = useMemo(() => {
        return item
            ? getItemLabel(item)
            : selectedField && friendlyName(selectedField);
    }, [item, selectedField]);

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

    useEffect(() => {
        if (bigNumberConfigData?.selectedField !== undefined)
            setSelectedField(bigNumberConfigData.selectedField);

        setBigNumberLabel(bigNumberConfigData?.label);
        setShowBigNumberLabel(bigNumberConfigData?.showBigNumberLabel ?? true);

        setBigNumberStyle(bigNumberConfigData?.style);
        setBigNumberComparisonStyle(bigNumberConfigData?.style);

        setShowComparison(bigNumberConfigData?.showComparison ?? false);
        setComparisonFormat(
            bigNumberConfigData?.comparisonFormat ?? ComparisonFormatTypes.RAW,
        );
        setFlipColors(bigNumberConfigData?.flipColors ?? false);
        setComparisonLabel(bigNumberConfigData?.comparisonLabel);
    }, [bigNumberConfigData]);

    // big number value (first row)
    const firstRowValueRaw = useMemo(() => {
        if (!selectedField || !resultsData) return;

        return resultsData.rows?.[0]?.[selectedField]?.value.raw;
    }, [selectedField, resultsData]);

    // value for comparison (second row)
    const secondRowValueRaw = useMemo(() => {
        if (!selectedField || !resultsData) return;
        return resultsData.rows?.[1]?.[selectedField]?.value.raw;
    }, [selectedField, resultsData]);

    const bigNumber = useMemo(() => {
        if (!isNumber(item, firstRowValueRaw)) {
            return (
                selectedField &&
                resultsData?.rows?.[0]?.[selectedField]?.value.formatted
            );
        } else if (item !== undefined && isTableCalculation(item)) {
            return formatItemValue(item, firstRowValueRaw);
        } else {
            return applyCustomFormat(
                firstRowValueRaw,
                getCustomFormatFromLegacy({
                    format: isField(item) ? item.format : undefined,
                    round: bigNumberStyle
                        ? 2
                        : isField(item)
                        ? item.round
                        : undefined,
                    compact: bigNumberStyle,
                }),
            );
        }
    }, [item, firstRowValueRaw, selectedField, bigNumberStyle, resultsData]);

    const unformattedValue = useMemo(() => {
        // For backwards compatibility with old table calculations without type
        const isCalculationTypeUndefined =
            item && isTableCalculation(item) && item.type === undefined;
        return (isNumber(item, secondRowValueRaw) &&
            isNumber(item, firstRowValueRaw)) ||
            isCalculationTypeUndefined
            ? calculateComparisonValue(
                  Number(firstRowValueRaw),
                  Number(secondRowValueRaw),
                  comparisonFormat,
              )
            : secondRowValueRaw === undefined
            ? UNDEFINED
            : NOT_APPLICABLE;
    }, [item, secondRowValueRaw, firstRowValueRaw, comparisonFormat]);

    const comparisonDiff = useMemo(() => {
        return unformattedValue === UNDEFINED
            ? ComparisonDiffTypes.UNDEFINED
            : unformattedValue === NOT_APPLICABLE
            ? ComparisonDiffTypes.NAN
            : unformattedValue > 0
            ? ComparisonDiffTypes.POSITIVE
            : unformattedValue < 0
            ? ComparisonDiffTypes.NEGATIVE
            : unformattedValue === 0
            ? ComparisonDiffTypes.NONE
            : ComparisonDiffTypes.NAN;
    }, [unformattedValue]);

    const comparisonValue = useMemo(() => {
        return unformattedValue === NOT_APPLICABLE
            ? NOT_APPLICABLE
            : formatComparisonValue(
                  comparisonFormat,
                  comparisonDiff,
                  item,
                  unformattedValue,
                  bigNumberComparisonStyle,
              );
    }, [
        comparisonFormat,
        comparisonDiff,
        item,
        unformattedValue,
        bigNumberComparisonStyle,
    ]);

    const comparisonTooltip = useMemo(() => {
        switch (comparisonDiff) {
            case ComparisonDiffTypes.POSITIVE:
            case ComparisonDiffTypes.NEGATIVE:
                return `${comparisonValue} compared to previous row`;
            case ComparisonDiffTypes.NONE:
                return `No change compared to previous row`;
            case ComparisonDiffTypes.NAN:
                return `The previous row's value is not a number`;
            case ComparisonDiffTypes.UNDEFINED:
                return `There is no previous row to compare to`;
        }
    }, [comparisonValue, comparisonDiff]);

    const showStyle =
        isNumber(item, firstRowValueRaw) &&
        item !== undefined &&
        !isTableCalculation(item) &&
        (!isField(item) || item.format !== 'percent');

    const validConfig: BigNumber = useMemo(() => {
        return {
            label: bigNumberLabel,
            style: bigNumberStyle,
            selectedField: selectedField,
            showBigNumberLabel,
            showComparison,
            comparisonFormat,
            flipColors,
            comparisonLabel,
        };
    }, [
        bigNumberLabel,
        bigNumberStyle,
        selectedField,
        showBigNumberLabel,
        showComparison,
        comparisonFormat,
        flipColors,
        comparisonLabel,
    ]);

    return {
        bigNumber,
        bigNumberLabel,
        defaultLabel: label,
        setBigNumberLabel,
        validConfig,
        bigNumberStyle,
        setBigNumberStyle,
        bigNumberComparisonStyle,
        setBigNumberComparisonStyle,
        showStyle,
        selectedField,
        setSelectedField,
        getField,
        comparisonValue,
        showBigNumberLabel,
        setShowBigNumberLabel,
        showComparison,
        setShowComparison,
        comparisonFormat,
        setComparisonFormat,
        comparisonDiff,
        flipColors,
        setFlipColors,
        comparisonTooltip,
        comparisonLabel,
        setComparisonLabel,
    };
};

export default useBigNumberConfig;
