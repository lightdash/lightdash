import {
    formatItemValue,
    getItemId,
    hashFieldReference,
    isDimension,
    type EChartsSeries,
    type ItemsMap,
    type ResultValue,
} from '@lightdash/common';
import { type EchartsSeriesClickEvent } from '../SimpleChart';
import { type UnderlyingDataConfig } from './types';

export const getDataFromChartClick = (
    e: EchartsSeriesClickEvent,
    itemsMap: ItemsMap,
    series: EChartsSeries[],
): UnderlyingDataConfig => {
    const pivotReference = series[e.seriesIndex]?.pivotReference;
    const selectedFields = Object.values(itemsMap).filter((item) => {
        if (
            !isDimension(item) &&
            pivotReference &&
            pivotReference.field === getItemId(item)
        ) {
            return e.dimensionNames.includes(
                hashFieldReference(pivotReference),
            );
        }
        return e.dimensionNames.includes(getItemId(item));
    });
    const selectedMetricsAndTableCalculations = selectedFields.filter(
        (item) => !isDimension(item),
    );

    let selectedField: ItemsMap[string] | undefined = undefined;
    if (selectedMetricsAndTableCalculations.length > 0) {
        selectedField = selectedMetricsAndTableCalculations[0];
    } else if (selectedFields.length > 0) {
        selectedField = selectedFields[0];
    }
    const selectedValue = selectedField
        ? e.data[getItemId(selectedField)]
        : undefined;
    const fieldValues: Record<string, ResultValue> = Object.entries(
        e.data,
    ).reduce((acc, entry) => {
        const [key, val] = entry;
        const raw = val === '∅' ? null : val; // convert ∅ values back to null. Echarts doesn't support null formatting https://github.com/apache/echarts/issues/15821
        return { ...acc, [key]: { raw, formatted: val } };
    }, {});

    return {
        item: selectedField,
        value: {
            raw: selectedValue,
            formatted: formatItemValue(selectedField, selectedValue),
        },
        fieldValues,
        pivotReference,
    };
};
