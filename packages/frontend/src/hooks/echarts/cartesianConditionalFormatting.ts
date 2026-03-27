import {
    getConditionalFormattingConfig,
    isConditionalFormattingConfigWithSingleColor,
    type ConditionalFormattingConfig,
    type EChartsSeries,
    type ItemsMap,
} from '@lightdash/common';

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

    const matchingConfig = getConditionalFormattingConfig({
        field: itemsMap[fieldId],
        value: rowValues[fieldId],
        minMaxMap: undefined,
        conditionalFormattings,
    });

    if (
        !matchingConfig ||
        !isConditionalFormattingConfigWithSingleColor(matchingConfig)
    ) {
        return undefined;
    }

    return matchingConfig.color;
};
