import {
    assertUnreachable,
    calculateComparisonValue,
    ComparisonDiffTypes,
    friendlyName,
    getConditionalFormattingConfig,
    getGranularityMapFromItems,
    getItemLabel,
    getItemLabelWithoutTableName,
    isConditionalFormattingConfigWithSingleColor,
    isField,
    isTableCalculation,
    resolveGranularityInLabel,
    type BigNumber,
    type CompactOrAlias,
    type GranularityMap,
    type ItemsMap,
} from '@lightdash/common';
import { type VisualizationContextInput } from '../types';
import {
    BIG_NUMBER_NOT_APPLICABLE,
    BIG_NUMBER_UNDEFINED,
    formatBigNumberValue,
    formatComparisonValue,
    isBigNumberValue,
} from './config';

export type BigNumberComparisonModel = {
    /** The comparison delta, formatted with its sign. */
    formattedValue: string;
    direction: ComparisonDiffTypes;
    /** The comparison label with `{granularity}` placeholders resolved. */
    label: string | undefined;
    tooltip: string;
};

/** What a big number renders: the pieces `BigNumberDisplay` takes as props. */
export type BigNumberModel = {
    /** The selected item, when it exists in the items map. */
    item: ItemsMap[string] | undefined;
    /** The first row's value, formatted; undefined without a row or a field. */
    value: string | undefined;
    /** CSS colour from conditional formatting, if a rule matches. */
    valueColor: string | undefined;
    /** The item's label, or the field id made friendly. */
    defaultLabel: string | undefined;
    /** The custom label with `{granularity}` placeholders resolved. */
    resolvedLabel: string | undefined;
    /** `resolvedLabel`, then `defaultLabel`, then empty. */
    label: string;
    showLabel: boolean;
    /** Computed even when hidden, so the editor can preview it. */
    comparison: BigNumberComparisonModel;
    showComparison: boolean;
    flipColors: boolean;
    /** Whether the compact style picker applies to the selected item. */
    showStyle: boolean;
    /** Field ids whose granularity a label placeholder can reference. */
    granularityFields: string[];
};

export type BigNumberModelInput = Pick<
    VisualizationContextInput,
    'resultsData' | 'itemsMap' | 'parameters'
> & {
    /** The resolved config; see `resolveBigNumberChartConfig`. */
    chartConfig: BigNumber;
    /**
     * The compact style of the comparison delta, which the editor keeps apart
     * from the value's. Left out, the value's style applies.
     */
    comparisonStyle?: CompactOrAlias;
};

/**
 * Derives everything a big number displays from its config and the first
 * two rows of the results: the formatted value, its conditional colour, the
 * labels and the comparison against the previous row or a comparison field.
 */
export const buildBigNumberModel = (
    input: BigNumberModelInput,
): BigNumberModel => {
    const { resultsData, itemsMap, parameters, chartConfig } = input;
    const {
        selectedField,
        comparisonField,
        comparisonFormat,
        style: bigNumberStyle,
        label: bigNumberLabel,
        comparisonLabel,
        showTableNamesInLabel,
        conditionalFormattings = [],
    } = chartConfig;
    const bigNumberComparisonStyle =
        'comparisonStyle' in input ? input.comparisonStyle : bigNumberStyle;

    const item = (() => {
        if (!itemsMap || !selectedField) return undefined;

        return itemsMap[selectedField];
    })();

    const label = (() => {
        // For backwards compatibility: undefined means show table names (existing charts)
        // false means hide table names (new charts default to hidden)
        const shouldShowTableName = showTableNamesInLabel ?? true;

        return item
            ? shouldShowTableName
                ? getItemLabel(item)
                : getItemLabelWithoutTableName(item)
            : selectedField && friendlyName(selectedField);
    })();

    const comparisonItem = (() => {
        if (!itemsMap || !comparisonField) return item;
        return itemsMap[comparisonField] ?? item;
    })();

    // big number value (first row)
    const firstRowValueRaw = (() => {
        if (!selectedField || !resultsData) return undefined;

        return resultsData.rows?.[0]?.[selectedField]?.value.raw;
    })();

    // value for comparison: field-based (same row, different field) or row-based (different row, same field)
    const secondRowValueRaw = (() => {
        if (!resultsData) return undefined;
        if (comparisonField) {
            return resultsData.rows?.[0]?.[comparisonField]?.value.raw;
        }
        if (!selectedField) return undefined;
        return resultsData.rows?.[1]?.[selectedField]?.value.raw;
    })();

    const secondRowValueFormatted = (() => {
        if (!resultsData) return undefined;
        if (comparisonField) {
            return resultsData.rows?.[0]?.[comparisonField]?.value.formatted;
        }
        if (!selectedField) return undefined;
        return resultsData.rows?.[1]?.[selectedField]?.value.formatted;
    })();

    const bigNumber = (() => {
        if (!isBigNumberValue(item, firstRowValueRaw)) {
            return (
                selectedField &&
                resultsData?.rows?.[0]?.[selectedField]?.value.formatted
            );
        }
        return formatBigNumberValue(
            item,
            firstRowValueRaw,
            bigNumberStyle,
            parameters,
            resultsData?.resolvedTimezone,
        );
    })();

    const unformattedValue = (() => {
        // For backwards compatibility with old table calculations without type
        const isCalculationTypeUndefined =
            item && isTableCalculation(item) && item.type === undefined;
        return (isBigNumberValue(comparisonItem, secondRowValueRaw) &&
            isBigNumberValue(item, firstRowValueRaw)) ||
            isCalculationTypeUndefined
            ? calculateComparisonValue(
                  Number(firstRowValueRaw),
                  Number(secondRowValueRaw),
                  comparisonFormat,
              )
            : secondRowValueRaw === undefined
              ? BIG_NUMBER_UNDEFINED
              : BIG_NUMBER_NOT_APPLICABLE;
    })();

    const comparisonDiff =
        unformattedValue === BIG_NUMBER_UNDEFINED
            ? ComparisonDiffTypes.UNDEFINED
            : unformattedValue === BIG_NUMBER_NOT_APPLICABLE
              ? ComparisonDiffTypes.NAN
              : unformattedValue > 0
                ? ComparisonDiffTypes.POSITIVE
                : unformattedValue < 0
                  ? ComparisonDiffTypes.NEGATIVE
                  : unformattedValue === 0
                    ? ComparisonDiffTypes.NONE
                    : ComparisonDiffTypes.NAN;

    const comparisonValue =
        unformattedValue === BIG_NUMBER_NOT_APPLICABLE
            ? (secondRowValueFormatted ?? BIG_NUMBER_NOT_APPLICABLE)
            : formatComparisonValue(
                  comparisonFormat,
                  comparisonDiff,
                  // Use the selected field's format so the comparison inherits
                  // the column's formatting, not the comparison field's
                  item,
                  unformattedValue,
                  bigNumberComparisonStyle,
                  parameters,
                  resultsData?.resolvedTimezone,
              );

    const comparisonTooltip = (() => {
        const source = comparisonField ? 'comparison field' : 'previous row';
        switch (comparisonDiff) {
            case ComparisonDiffTypes.POSITIVE:
            case ComparisonDiffTypes.NEGATIVE:
                return `${comparisonValue} compared to ${source}`;
            case ComparisonDiffTypes.NONE:
                return `No change compared to ${source}`;
            case ComparisonDiffTypes.NAN:
                return `${comparisonValue} from ${source}`;
            case ComparisonDiffTypes.UNDEFINED:
                return comparisonField
                    ? `Comparison field has no value`
                    : `There is no previous row to compare to`;
            default:
                return assertUnreachable(
                    comparisonDiff,
                    `Unknown comparison diff ${comparisonDiff}`,
                );
        }
    })();

    const granularityMap: GranularityMap = getGranularityMapFromItems(itemsMap);

    const resolvedBigNumberLabel = resolveGranularityInLabel(
        bigNumberLabel,
        granularityMap,
    );

    const resolvedComparisonLabel = resolveGranularityInLabel(
        comparisonLabel,
        granularityMap,
    );

    const bigNumberTextColor = (() => {
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
    })();

    const showStyle =
        isBigNumberValue(item, firstRowValueRaw) &&
        item !== undefined &&
        !isTableCalculation(item) &&
        (!isField(item) || item.format !== 'percent');

    return {
        item,
        value: bigNumber,
        valueColor: bigNumberTextColor,
        defaultLabel: label,
        resolvedLabel: resolvedBigNumberLabel,
        label: resolvedBigNumberLabel || label || '',
        showLabel: !!chartConfig.showBigNumberLabel,
        comparison: {
            formattedValue: comparisonValue,
            direction: comparisonDiff,
            label: resolvedComparisonLabel,
            tooltip: comparisonTooltip,
        },
        showComparison: !!chartConfig.showComparison,
        flipColors: !!chartConfig.flipColors,
        showStyle,
        granularityFields: Object.keys(granularityMap),
    };
};
