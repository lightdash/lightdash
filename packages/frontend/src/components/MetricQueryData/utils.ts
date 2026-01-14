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

/**
 * Generates possible column names for a pivot reference to handle both
 * old format (field.pivotField.value) and new SQL pivot format (field_any_value)
 */
const getPivotColumnNames = (pivotReference: {
    field: string;
    pivotValues?: { field: string; value: unknown }[];
}): string[] => {
    const names: string[] = [];

    // Old format: field.pivotField.value (using hashFieldReference)
    names.push(hashFieldReference(pivotReference));

    // New SQL pivot format: field_any_value
    if (pivotReference.pivotValues && pivotReference.pivotValues.length > 0) {
        const pivotValue = pivotReference.pivotValues[0].value;
        // Format: metricField_any_pivotValue (e.g., orders_total_order_amount_any_credit_card)
        names.push(`${pivotReference.field}_any_${pivotValue}`);
    }

    return names;
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
            // Check both old and new pivot column name formats
            const possibleNames = getPivotColumnNames(pivotReference);
            return possibleNames.some((name) =>
                e.dimensionNames.includes(name),
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

    // For pivoted metrics, we need to find the value using any of the possible column names
    // and also ensure it's accessible via the hashFieldReference key
    let selectedValue: unknown;
    if (selectedField && pivotReference) {
        const possibleNames = getPivotColumnNames(pivotReference);
        const matchingName = possibleNames.find((name) => fieldValues[name]);
        if (matchingName) {
            selectedValue = fieldValues[matchingName]?.raw;
            // Also add the value under the hashFieldReference key for DrillDownMenuItem
            const hashKey = hashFieldReference(pivotReference);
            if (!fieldValues[hashKey] && fieldValues[matchingName]) {
                fieldValues[hashKey] = fieldValues[matchingName];
            }
        }
    } else if (selectedField) {
        selectedValue = fieldValues[getItemId(selectedField)]?.raw;
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
