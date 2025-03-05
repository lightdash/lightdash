import {
    convertCustomMetricToDbt,
    isAdditionalMetric,
    isCustomDimension,
    previewConvertCustomDimensionToDbt,
    type AdditionalMetric,
    type CustomDimension,
} from '@lightdash/common';

export const match = <T, U = T>(
    item: CustomDimension | AdditionalMetric,
    selectCustomDimension: (item: CustomDimension) => T,
    selectCustomMetric: (item: AdditionalMetric) => U,
) => {
    if (isCustomDimension(item))
        return selectCustomDimension(item as CustomDimension);
    else if (isAdditionalMetric(item))
        return selectCustomMetric(item as AdditionalMetric);
    throw new Error(`Invalid item type: ${JSON.stringify(item)}`);
};

export const convertToDbt = (item: CustomDimension | AdditionalMetric) => {
    const key = match(
        item,
        (customDimension) => customDimension.id,
        (customMetric) => customMetric.name,
    );

    const value = match(
        item,
        (i) => previewConvertCustomDimensionToDbt(i),
        (i) => convertCustomMetricToDbt(i),
    );

    return {
        key,
        value,
    };
};

export const getItemId = (item: CustomDimension | AdditionalMetric) => {
    return match(
        item,
        (i) => i.id,
        (i) => i.name,
    );
};
export const getItemLabel = (item: CustomDimension | AdditionalMetric) => {
    return match(
        item,
        (i) => i.name,
        (i) => i.label!,
    );
};
