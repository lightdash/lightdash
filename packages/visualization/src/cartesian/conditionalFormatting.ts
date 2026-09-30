import {
    getConditionalFormattingConfig,
    getItemId,
    isConditionalFormattingConfigWithSingleColor,
    type ConditionalFormattingConfig,
    type ConditionalFormattingRowFields,
    type EChartsSeries,
    type ItemsMap,
} from '@lightdash/common';

const getCartesianConditionalFormattingRowFields = (
    itemsMap: ItemsMap,
    rowValues: Record<string, unknown>,
): ConditionalFormattingRowFields =>
    Object.entries(rowValues).reduce<ConditionalFormattingRowFields>(
        (acc, [fieldId, value]) => {
            const field = itemsMap[fieldId];
            if (!field) return acc;

            const rowField = {
                field,
                value,
            };
            acc[fieldId] = rowField;
            acc[getItemId(field)] = rowField;

            return acc;
        },
        {},
    );

export const getCartesianConditionalFormattingColor = ({
    itemsMap,
    conditionalFormattings,
    rowValues,
    series,
}: {
    itemsMap: ItemsMap | undefined;
    conditionalFormattings: ConditionalFormattingConfig[] | undefined;
    rowValues: Record<string, unknown>;
    series: EChartsSeries;
}) => {
    if (!itemsMap || !conditionalFormattings?.length) return undefined;

    const fieldId = series.encode?.yRef?.field;
    if (!fieldId) return undefined;

    const supportedConditionalFormattings = conditionalFormattings.filter(
        isConditionalFormattingConfigWithSingleColor,
    );
    if (!supportedConditionalFormattings.length) return undefined;

    const rowFields = getCartesianConditionalFormattingRowFields(
        itemsMap,
        rowValues,
    );

    const matchingConfig = getConditionalFormattingConfig({
        field: itemsMap[fieldId],
        value: rowValues[fieldId],
        minMaxMap: undefined,
        conditionalFormattings: supportedConditionalFormattings,
        rowFields,
    });

    if (
        !matchingConfig ||
        !isConditionalFormattingConfigWithSingleColor(matchingConfig)
    ) {
        return undefined;
    }

    return matchingConfig.color;
};
