import {
    ComparisonDiffTypes,
    ComparisonFormatTypes,
    CustomFormatType,
    applyCustomFormat,
    formatItemValue,
    friendlyName,
    getConditionalFormattingConfig,
    getCustomFormatFromLegacy,
    getItemId,
    getItemLabel,
    getItemLabelWithoutTableName,
    hasFormatOptions,
    hasValidFormatExpression,
    isConditionalFormattingConfigWithSingleColor,
    isField,
    isMetric,
    isNumericItem,
    isTableCalculation,
    valueIsNaN,
    type BigNumber,
    type CompactOrAlias,
    type ConditionalFormattingConfig,
    type ItemsMap,
    type ParametersValuesMap,
    type TableCalculationMetadata,
} from '@lightdash/common';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type InfiniteQueryResults } from './useQueryResults';

export const calculateComparisonValue = (
    a: number,
    b: number,
    format: ComparisonFormatTypes | undefined,
) => {
    switch (format) {
        case ComparisonFormatTypes.VALUE:
            return b;
        case ComparisonFormatTypes.PERCENTAGE:
            return (a - b) / Math.abs(b);
        case ComparisonFormatTypes.RAW:
        default:
            return a - b;
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
    parameters?: ParametersValuesMap,
    comparisonItem?: ItemsMap[string] | undefined,
) => {
    if (value === UNDEFINED) {
        value = NOT_APPLICABLE;
    }

    // VALUE format: show comparison field's value directly, no +/- prefix
    if (format === ComparisonFormatTypes.VALUE) {
        const valueItem = comparisonItem ?? item;
        if (valueItem !== undefined && isTableCalculation(valueItem)) {
            return formatItemValue(valueItem, value, false, parameters);
        }
        return bigNumberComparisonStyle
            ? applyCustomFormat(
                  value,
                  getCustomFormatFromLegacy({
                      format: isField(valueItem) ? valueItem.format : undefined,
                      round: 2,
                      compact: bigNumberComparisonStyle,
                  }),
              )
            : formatItemValue(valueItem, value, false, parameters);
    }

    const prefix =
        comparisonDiff === ComparisonDiffTypes.POSITIVE ||
        comparisonDiff === ComparisonDiffTypes.NONE
            ? '+'
            : '';

    switch (format) {
        case ComparisonFormatTypes.PERCENTAGE:
            return `${prefix}${applyCustomFormat(value, {
                round: 0,
                type: CustomFormatType.PERCENT,
            })}`;
        case ComparisonFormatTypes.RAW:
            if (item !== undefined && isTableCalculation(item)) {
                return `${prefix}${formatItemValue(
                    item,
                    value,
                    false,
                    parameters,
                )}`;
            }

            const formattedValue = bigNumberComparisonStyle
                ? applyCustomFormat(
                      value,
                      getCustomFormatFromLegacy({
                          format: isField(item) ? item.format : undefined,
                          round: 2,
                          compact: bigNumberComparisonStyle,
                      }),
                  )
                : formatItemValue(item, value, false, parameters);

            return `${prefix}${formattedValue}`;
        default:
            if (item !== undefined && isTableCalculation(item)) {
                return formatItemValue(item, value, false, parameters);
            }
            return bigNumberComparisonStyle
                ? applyCustomFormat(
                      value,
                      getCustomFormatFromLegacy({
                          format: isField(item) ? item.format : undefined,
                          round: 2,
                          compact: bigNumberComparisonStyle,
                      }),
                  )
                : formatItemValue(item, value, false, parameters);
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
    resultsData: InfiniteQueryResults | undefined,
    itemsMap: ItemsMap | undefined,
    tableCalculationsMetadata?: TableCalculationMetadata[],
    parameters?: ParametersValuesMap,
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

    const [showTableNamesInLabel, setShowTableNamesInLabel] = useState<
        BigNumber['showTableNamesInLabel'] | undefined
    >(bigNumberConfigData?.showTableNamesInLabel);

    const label = useMemo(() => {
        // For backwards compatibility: undefined means show table names (existing charts)
        // false means hide table names (new charts default to hidden)
        const shouldShowTableName = showTableNamesInLabel ?? true;

        return item
            ? shouldShowTableName
                ? getItemLabel(item)
                : getItemLabelWithoutTableName(item)
            : selectedField && friendlyName(selectedField);
    }, [item, selectedField, showTableNamesInLabel]);

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

    // big number value (first row)
    const firstRowValueRaw = useMemo(() => {
        if (!selectedField || !resultsData) return;

        return resultsData.rows?.[0]?.[selectedField]?.value.raw;
    }, [selectedField, resultsData]);

    // value for comparison: field-based (same row, different field) or row-based (different row, same field)
    const secondRowValueRaw = useMemo(() => {
        if (!resultsData) return;
        if (comparisonField) {
            return resultsData.rows?.[0]?.[comparisonField]?.value.raw;
        }
        if (!selectedField) return;
        return resultsData.rows?.[1]?.[selectedField]?.value.raw;
    }, [selectedField, comparisonField, resultsData]);

    const comparisonItem = useMemo(() => {
        if (!itemsMap || !comparisonField) return;
        return itemsMap[comparisonField];
    }, [itemsMap, comparisonField]);

    const bigNumber = useMemo(() => {
        if (!isNumber(item, firstRowValueRaw)) {
            return (
                selectedField &&
                resultsData?.rows?.[0]?.[selectedField]?.value.formatted
            );
        } else if (item !== undefined && isTableCalculation(item)) {
            return formatItemValue(item, firstRowValueRaw, false, parameters);
        } else if (
            item !== undefined &&
            hasValidFormatExpression(item) &&
            !bigNumberStyle // If the big number has a comparison style, don't use the format expression returned by the backend
        ) {
            return formatItemValue(item, firstRowValueRaw, false, parameters);
        } else if (item !== undefined && hasFormatOptions(item)) {
            // Custom metrics case

            // If the custom metric has no format, but the big number has
            // compact, treat the custom metric as a number
            const type =
                item.formatOptions?.type === CustomFormatType.DEFAULT
                    ? bigNumberStyle
                        ? CustomFormatType.NUMBER
                        : CustomFormatType.DEFAULT
                    : item.formatOptions?.type;

            return applyCustomFormat(firstRowValueRaw, {
                ...item.formatOptions,
                type,
                compact: bigNumberStyle ?? item.formatOptions?.compact,
            });
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
    }, [
        item,
        firstRowValueRaw,
        selectedField,
        bigNumberStyle,
        resultsData,
        parameters,
    ]);

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
        if (comparisonFormat === ComparisonFormatTypes.VALUE) {
            return unformattedValue === UNDEFINED
                ? ComparisonDiffTypes.UNDEFINED
                : unformattedValue === NOT_APPLICABLE
                  ? ComparisonDiffTypes.NAN
                  : ComparisonDiffTypes.NONE;
        }
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
    }, [unformattedValue, comparisonFormat]);

    const comparisonValue = useMemo(() => {
        return unformattedValue === NOT_APPLICABLE
            ? NOT_APPLICABLE
            : formatComparisonValue(
                  comparisonFormat,
                  comparisonDiff,
                  item,
                  unformattedValue,
                  bigNumberComparisonStyle,
                  parameters,
                  comparisonItem,
              );
    }, [
        comparisonFormat,
        comparisonDiff,
        item,
        unformattedValue,
        bigNumberComparisonStyle,
        parameters,
        comparisonItem,
    ]);

    const comparisonTooltip = useMemo(() => {
        if (comparisonFormat === ComparisonFormatTypes.VALUE) {
            if (comparisonDiff === ComparisonDiffTypes.UNDEFINED) {
                return comparisonField
                    ? `Comparison field has no value`
                    : `There is no previous row to compare to`;
            }
            if (comparisonDiff === ComparisonDiffTypes.NAN) {
                return `The comparison value is not a number`;
            }
            return `${comparisonValue}`;
        }
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
    }, [comparisonValue, comparisonDiff, comparisonFormat, comparisonField]);

    const bigNumberTextColor = useMemo(() => {
        if (!conditionalFormattings.length || !item || !selectedField)
            return undefined;

        const rawValue = firstRowValueRaw;

        const matchingConfig = getConditionalFormattingConfig({
            field: item,
            value: rawValue,
            minMaxMap: {},
            conditionalFormattings,
        });

        if (
            !matchingConfig ||
            !isConditionalFormattingConfigWithSingleColor(matchingConfig)
        )
            return undefined;

        const lightColor = matchingConfig.color;
        const darkColor = matchingConfig.darkColor ?? lightColor;

        return `light-dark(${lightColor}, ${darkColor})`;
    }, [conditionalFormattings, item, selectedField, firstRowValueRaw]);

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
        showTableNamesInLabel,
        setShowTableNamesInLabel,
        conditionalFormattings,
        onSetConditionalFormattings: setConditionalFormattings,
        bigNumberTextColor,
        comparisonField,
        setComparisonField,
    };
};

export default useBigNumberConfig;
