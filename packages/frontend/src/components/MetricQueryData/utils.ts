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

/**
 * Extracts field values from ECharts click event data.
 *
 * For stacked bar charts, e.value is an array and e.dimensionNames maps indices to field names.
 * For other charts, e.data is an object with field names as keys.
 */
const extractFieldValuesFromClickEvent = (
    e: EchartsSeriesClickEvent,
): Record<string, ResultValue> => {
    // Stacked bar charts: e.value is an array, use e.dimensionNames to map indices to field names
    if (Array.isArray(e.value) && e.dimensionNames) {
        const valueArray = e.value as unknown[];
        const fieldValues: Record<string, ResultValue> = {};
        e.dimensionNames.forEach((dimName, index) => {
            if (dimName && index < valueArray.length) {
                const val = valueArray[index];
                const raw = val === '∅' ? null : val; // convert ∅ values back to null. Echarts doesn't support null formatting https://github.com/apache/echarts/issues/15821
                fieldValues[dimName] = { raw, formatted: String(val ?? '') };
            }
        });
        return fieldValues;
    }

    return Object.entries(e.data).reduce<Record<string, ResultValue>>(
        (acc, [key, val]) => {
            const raw = val === '∅' ? null : val; // convert ∅ values back to null. Echarts doesn't support null formatting https://github.com/apache/echarts/issues/15821
            return { ...acc, [key]: { raw, formatted: val } };
        },
        {},
    );
};

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

    const fieldValues = extractFieldValuesFromClickEvent(e);

    const selectedValue = selectedField
        ? fieldValues[getItemId(selectedField)]?.raw
        : undefined;

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
