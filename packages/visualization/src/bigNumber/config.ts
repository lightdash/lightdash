import {
    applyCustomFormat,
    ComparisonDiffTypes,
    ComparisonFormatTypes,
    CustomFormatType,
    formatItemValue,
    getCustomFormatFromLegacy,
    getItemId,
    hasFormatOptions,
    hasValidFormatExpression,
    isField,
    isMetric,
    isNumericItem,
    isTableCalculation,
    valueIsNaN,
    type BigNumber,
    type CompactOrAlias,
    type ItemsMap,
    type ParametersValuesMap,
    type TableCalculationMetadata,
} from '@lightdash/common';

export const BIG_NUMBER_NOT_APPLICABLE = 'n/a';
export const BIG_NUMBER_UNDEFINED = 'undefined';

// Formats a big number value (main value or comparison delta) with the field's
// custom format; `style` overrides the field's compact. Shared so both stay in sync.
export const formatBigNumberValue = (
    item: ItemsMap[string] | undefined,
    value: unknown,
    style: CompactOrAlias | undefined,
    parameters?: ParametersValuesMap,
    timezone?: string,
): string => {
    if (item !== undefined && isTableCalculation(item)) {
        return formatItemValue(item, value, false, parameters, timezone);
    } else if (
        item !== undefined &&
        hasValidFormatExpression(item) &&
        // When a compact style is set, fall through so the style is applied
        !style
    ) {
        return formatItemValue(item, value, false, parameters, timezone);
    } else if (item !== undefined && hasFormatOptions(item)) {
        // If the format has no explicit type but a compact style is set, treat
        // it as a number so the style can be applied
        const type =
            item.formatOptions?.type === CustomFormatType.DEFAULT
                ? style
                    ? CustomFormatType.NUMBER
                    : CustomFormatType.DEFAULT
                : item.formatOptions?.type;

        return applyCustomFormat(
            value,
            {
                ...item.formatOptions,
                type,
                compact: style ?? item.formatOptions?.compact,
            },
            timezone,
        );
    } else if (!style) {
        // No compact override: honour the field's full format (legacy compact,
        // separator, round), matching the results table
        return formatItemValue(item, value, false, parameters, timezone);
    }
    const metricRound = isField(item) ? item.round : undefined;
    return applyCustomFormat(
        value,
        getCustomFormatFromLegacy({
            format: isField(item) ? item.format : undefined,
            round: metricRound ?? 2,
            compact: style,
        }),
        timezone,
    );
};

export const formatComparisonValue = (
    format: ComparisonFormatTypes | undefined,
    comparisonDiff: ComparisonDiffTypes | undefined,
    item: ItemsMap[string] | undefined,
    value: number | string,
    bigNumberComparisonStyle: CompactOrAlias | undefined,
    parameters?: ParametersValuesMap,
    timezone?: string,
) => {
    const prefix =
        comparisonDiff === ComparisonDiffTypes.POSITIVE ||
        comparisonDiff === ComparisonDiffTypes.NONE
            ? '+'
            : '';
    const comparisonValue =
        value === BIG_NUMBER_UNDEFINED ? BIG_NUMBER_NOT_APPLICABLE : value;
    switch (format) {
        case ComparisonFormatTypes.PERCENTAGE:
            return `${prefix}${applyCustomFormat(comparisonValue, {
                round: 0,
                type: CustomFormatType.PERCENT,
            })}`;
        case ComparisonFormatTypes.RAW:
        default:
            return `${prefix}${formatBigNumberValue(
                item,
                comparisonValue,
                bigNumberComparisonStyle,
                parameters,
                timezone,
            )}`;
    }
};

/** Whether `value` of `item` can be shown as a number (and compared). */
export const isBigNumberValue = (i: ItemsMap[string] | undefined, value: any) =>
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

/** The field ids a big number can show, metrics first, then table calculations. */
export const getAvailableBigNumberFieldIds = (
    itemsMap: ItemsMap | undefined,
): string[] => {
    const itemsSortedByType = Object.values(itemsMap || {}).sort((a, b) => {
        return getItemPriority(a) - getItemPriority(b);
    });
    return itemsSortedByType.map(getItemId);
};

export type ResolveBigNumberSelectedFieldArgs = {
    /** The field currently selected in the editor; undefined on first load. */
    selectedField: string | undefined;
    /** The field the saved config points at. */
    configSelectedField: string | undefined;
    itemsMap: ItemsMap | undefined;
    availableFieldsIds: string[];
    tableCalculationsMetadata?: TableCalculationMetadata[];
};

/**
 * The field the big number should select given the saved config and the
 * available items: a renamed table calculation follows its new name, a
 * missing field falls back to the first available one. Returns `undefined`
 * when the current selection should be kept.
 */
export const resolveBigNumberSelectedField = ({
    selectedField,
    configSelectedField,
    itemsMap,
    availableFieldsIds,
    tableCalculationsMetadata,
}: ResolveBigNumberSelectedFieldArgs): string | undefined => {
    if (!itemsMap || availableFieldsIds.length === 0) return undefined;

    if (tableCalculationsMetadata) {
        /**
         * When table calculations update, their name changes, so we need to update the selected fields
         * If the selected field is a table calculation with the old name in the metadata, set it to the new name
         */
        const selectedFieldTcIndex = tableCalculationsMetadata.findIndex(
            (tc) => configSelectedField === tc.oldName,
        );

        if (selectedFieldTcIndex !== -1) {
            return tableCalculationsMetadata[selectedFieldTcIndex].name;
        }
    }

    const selectedFieldExists =
        configSelectedField && itemsMap[configSelectedField] !== undefined;
    const defaultSelectedField = selectedFieldExists
        ? configSelectedField
        : availableFieldsIds[0];

    if (selectedField === undefined || selectedFieldExists === false) {
        // Set default selectedField on explore load
        // or if existing selectedField is no longer available, default to first available field
        return defaultSelectedField;
    }
    return undefined;
};

export type ResolveBigNumberChartConfigArgs = {
    chartConfig: BigNumber | undefined;
    itemsMap: ItemsMap | undefined;
    tableCalculationsMetadata?: TableCalculationMetadata[];
};

/**
 * Resolves a saved big number config against the available items, the way
 * the explorer does when it first mounts a chart: fills in the defaults of
 * every editor toggle and picks the selected field.
 *
 * The frontend's `useBigNumberConfig` runs the same steps inside its
 * effects; this is the one-shot equivalent for headless rendering.
 */
export const resolveBigNumberChartConfig = ({
    chartConfig,
    itemsMap,
    tableCalculationsMetadata,
}: ResolveBigNumberChartConfigArgs): BigNumber => {
    const selectedField = chartConfig
        ? (resolveBigNumberSelectedField({
              selectedField: undefined,
              configSelectedField: chartConfig.selectedField,
              itemsMap,
              availableFieldsIds: getAvailableBigNumberFieldIds(itemsMap),
              tableCalculationsMetadata,
          }) ?? chartConfig.selectedField)
        : undefined;

    return {
        label: chartConfig?.label,
        style: chartConfig?.style,
        selectedField,
        showBigNumberLabel: chartConfig?.showBigNumberLabel ?? true,
        showTableNamesInLabel: chartConfig?.showTableNamesInLabel ?? true,
        showComparison: chartConfig?.showComparison ?? false,
        comparisonFormat:
            chartConfig?.comparisonFormat ?? ComparisonFormatTypes.RAW,
        flipColors: chartConfig?.flipColors ?? false,
        comparisonLabel: chartConfig?.comparisonLabel,
        conditionalFormattings: chartConfig?.conditionalFormattings ?? [],
        comparisonField: chartConfig?.comparisonField,
    };
};
