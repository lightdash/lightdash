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
    const currentSeries = series[e.seriesIndex];
    const pivotReference = currentSeries?.pivotReference;
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

    // Fix: For stacked bar charts, e.data may not include the x-axis dimension value
    // when using tuple/array mode. The x-axis value is available in e.name.
    // We need to add it to fieldValues to ensure proper filtering in underlying data.
    if (currentSeries?.encode) {
        const xFieldHash = currentSeries.encode.x;
        const yFieldHash = currentSeries.encode.y;

        // Check if the x-axis dimension is missing from fieldValues
        if (xFieldHash && !fieldValues[xFieldHash]) {
            // e.name contains the x-axis category value
            const xAxisValue = e.name;
            fieldValues[xFieldHash] = {
                raw: xAxisValue,
                formatted: xAxisValue,
            };
        }

        // Similarly, check if the y-axis dimension is missing (for horizontal bar charts)
        if (yFieldHash && !fieldValues[yFieldHash]) {
            const yAxisValue = e.name;
            fieldValues[yFieldHash] = {
                raw: yAxisValue,
                formatted: yAxisValue,
            };
        }
    }

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
