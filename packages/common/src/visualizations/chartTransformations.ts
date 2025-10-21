import toNumber from 'lodash/toNumber';

/**
 * ECharts tooltip parameter types
 * These represent the structure of params passed to tooltip formatters
 */
export interface TooltipParam {
    seriesName?: string;
    marker?: string;
    encode?: {
        x?: string | number | (string | number)[];
        y?: string | number | (string | number)[];
    };
    dimensionNames?: string[];
    data?: Record<string, unknown>;
    value?: Record<string, unknown> | unknown[];
    axisValue?: string | number;
    axisValueLabel?: string | number;
}

type TooltipParams = TooltipParam | TooltipParam[];

type GetDimensionNameFn = (param: TooltipParam) => string | undefined;

/**
 * Creates a tooltip formatter for 100% stacked charts
 * This formatter shows both the percentage and the original count value
 *
 * @param originalValues - Map of x-axis values to their original y-values
 * @param getDimensionName - Function to extract the dimension name from a param
 * @param xAxisField - The x-axis field name to extract the raw x value from param data
 * @returns A formatter function compatible with ECharts tooltip
 *
 * @example
 * // SQL Runner usage
 * const formatter = createStack100TooltipFormatter(
 *     originalValues,
 *     (param) => {
 *         const { encode, dimensionNames } = param;
 *         const yFieldIndex = Array.isArray(encode.y) ? encode.y[0] : encode.y;
 *         return dimensionNames?.[yFieldIndex];
 *     },
 *     xFieldId
 * );
 *
 * @example
 * // Explorer usage with flip axes
 * const formatter = createStack100TooltipFormatter(
 *     originalValues,
 *     (param) => {
 *         const { encode, dimensionNames } = param;
 *         if (!dimensionNames || !encode) return undefined;
 *         return flipAxes ? dimensionNames[1] : dimensionNames[encode.y?.[0]];
 *     },
 *     xFieldId
 * );
 */
export function createStack100TooltipFormatter(
    originalValues: Map<string, Map<string, number>>,
    getDimensionName: GetDimensionNameFn,
    xAxisField: string,
) {
    return (params: TooltipParams) => {
        if (!Array.isArray(params)) return '';

        // Use axisValueLabel for display (formatted value)
        const displayXValue = String(
            params[0]?.axisValueLabel || params[0]?.axisValue || '',
        );
        let result = `<strong>${displayXValue}</strong><br/>`;

        params.forEach((param) => {
            const { seriesName = '', marker = '' } = param;
            const dimensionName = getDimensionName(param);

            if (dimensionName) {
                // Access value - try both data and value for compatibility
                // SQL Runner uses 'data', Explorer uses 'value'
                const valueObject =
                    param.data ||
                    (typeof param.value === 'object' &&
                    !Array.isArray(param.value)
                        ? param.value
                        : undefined);

                if (valueObject && typeof valueObject === 'object') {
                    const percentage = valueObject[dimensionName];

                    // Get the raw x-axis value from the data for originalValues lookup
                    const rawXValue = String(valueObject[xAxisField] ?? '');
                    const originalValue =
                        originalValues?.get(rawXValue)?.get(dimensionName) || 0;

                    result += `${marker} ${seriesName}: ${Number(
                        percentage,
                    ).toFixed(2)}%, count: ${Number(originalValue).toFixed(
                        2,
                    )}<br/>`;
                }
            }
        });

        return result;
    };
}

/**
 * Transform data for 100% stacked charts
 *
 * Converts absolute values to percentages where each stacked group totals 100%.
 * Also preserves original values for tooltip display.
 *
 * @param rows - Array of data rows to transform
 * @param xAxisField - Field reference for the x-axis (grouping key)
 * @param yFieldRefs - Array of field references for y-axis values to convert to percentages
 * @returns Object containing transformed data and original values map
 */
export function transformToPercentageStacking<
    T extends Record<string, unknown>,
>(
    rows: T[],
    xAxisField: string,
    yFieldRefs: string[],
): {
    transformedResults: T[];
    originalValues: Map<string, Map<string, number>>;
} {
    const originalValues = new Map<string, Map<string, number>>();
    const totals = new Map<string, number>();

    // Calculate totals for each x-axis value
    rows.forEach((row) => {
        const xValue = String(row[xAxisField]);
        let total = 0;

        yFieldRefs.forEach((yField) => {
            const value = toNumber(row[yField]) || 0;
            total += value;

            // Store original value
            if (!originalValues.has(xValue)) {
                originalValues.set(xValue, new Map());
            }
            originalValues.get(xValue)!.set(yField, value);
        });

        totals.set(xValue, total);
    });

    // Transform data to percentages
    const transformedResults = rows.map((row) => {
        const xValue = String(row[xAxisField]);
        const total = totals.get(xValue) || 1; // Avoid division by zero
        const newRow = { ...row };

        yFieldRefs.forEach((yField) => {
            const value = toNumber(row[yField]) || 0;
            (newRow as Record<string, unknown>)[yField] = (value / total) * 100;
        });

        return newRow;
    });

    return { transformedResults, originalValues };
}
