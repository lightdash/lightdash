import {
    ChartType,
    type CartesianChart,
    type ChartConfig,
} from '../types/savedCharts';

/**
 * Input for detecting unused dimensions in a cartesian chart.
 */
export type UnusedDimensionsInput = {
    /** The chart configuration */
    chartType: ChartType;
    /** The chart config object (contains layout for cartesian charts) */
    chartConfig: ChartConfig['config'] | undefined;
    /** Pivot/group by dimension field IDs */
    pivotDimensions: string[];
    /** All dimension field IDs in the metric query */
    queryDimensions: string[];
};

/**
 * Detects dimensions in the query that are not used in the chart configuration.
 *
 * For cartesian charts, dimensions should be used in one of:
 * - x-axis (xField)
 * - y-axis (yField) - though typically metrics go here
 * - group by / pivot (pivotDimensions)
 *
 * If a dimension is in the query but not used in any of these places,
 * it may cause incorrect results when using backend pivoting.
 *
 * @returns Array of unused dimension field IDs, or empty array if none
 */
export function getUnusedDimensions(input: UnusedDimensionsInput): {
    unusedDimensions: string[];
} {
    const { chartType, chartConfig, pivotDimensions, queryDimensions } = input;

    if (chartType !== ChartType.CARTESIAN) {
        return { unusedDimensions: [] };
    }

    if (queryDimensions.length === 0) {
        return { unusedDimensions: [] };
    }

    const usedDimensions = new Set<string>();

    // Get layout from cartesian chart config
    // We cast to CartesianChart since we've already verified chartType is CARTESIAN
    const cartesianConfig = chartConfig as CartesianChart | undefined;
    const layout = cartesianConfig?.layout;

    // Add xField if it's a dimension (i.e., in the queryDimensions list)
    if (layout?.xField && queryDimensions.includes(layout.xField)) {
        usedDimensions.add(layout.xField);
    }

    // Add yField items if they're dimensions
    if (layout?.yField) {
        for (const field of layout.yField) {
            if (queryDimensions.includes(field)) {
                usedDimensions.add(field);
            }
        }
    }

    // Add all pivot dimensions (these are always dimensions by definition)
    for (const pivotDim of pivotDimensions) {
        usedDimensions.add(pivotDim);
    }

    // Find query dimensions that are not used anywhere
    const unusedDimensions = queryDimensions.filter(
        (dim) => !usedDimensions.has(dim),
    );

    return { unusedDimensions };
}

/**
 * Checks if a chart has unused dimensions that may cause incorrect results.
 * This is a convenience wrapper around getUnusedDimensions.
 */
export function hasUnusedDimensions(input: UnusedDimensionsInput): boolean {
    return getUnusedDimensions(input).unusedDimensions.length > 0;
}

/**
 * Input for detecting unused table calculations in a cartesian chart.
 */
export type UnusedTableCalculationsInput = {
    /** The chart configuration */
    chartType: ChartType;
    /** The chart config object (contains layout for cartesian charts) */
    chartConfig: ChartConfig['config'] | undefined;
    /** All table calculation names in the metric query */
    queryTableCalculations: string[];
};

/**
 * Detects table calculations in the query that are not used in the chart configuration.
 *
 * For cartesian charts, table calculations should be used in one of:
 * - x-axis (xField)
 * - y-axis (yField)
 *
 * If a table calculation is in the query but not used in any of these places,
 * it may cause incorrect results (extra rows that don't aggregate properly).
 *
 * @returns Array of unused table calculation names, or empty array if none
 */
export function getUnusedTableCalculations(
    input: UnusedTableCalculationsInput,
): {
    unusedTableCalculations: string[];
} {
    const { chartType, chartConfig, queryTableCalculations } = input;

    if (chartType !== ChartType.CARTESIAN) {
        return { unusedTableCalculations: [] };
    }

    if (queryTableCalculations.length === 0) {
        return { unusedTableCalculations: [] };
    }

    const usedTableCalculations = new Set<string>();

    // Get layout from cartesian chart config
    const cartesianConfig = chartConfig as CartesianChart | undefined;
    const layout = cartesianConfig?.layout;

    // Add xField if it's a table calculation
    if (layout?.xField && queryTableCalculations.includes(layout.xField)) {
        usedTableCalculations.add(layout.xField);
    }

    // Add yField items if they're table calculations
    if (layout?.yField) {
        for (const field of layout.yField) {
            if (queryTableCalculations.includes(field)) {
                usedTableCalculations.add(field);
            }
        }
    }

    // Find query table calculations that are not used anywhere
    const unusedTableCalculations = queryTableCalculations.filter(
        (tc) => !usedTableCalculations.has(tc),
    );

    return { unusedTableCalculations };
}

/**
 * Checks if a chart has unused table calculations that may cause incorrect results.
 * This is a convenience wrapper around getUnusedTableCalculations.
 */
export function hasUnusedTableCalculations(
    input: UnusedTableCalculationsInput,
): boolean {
    return getUnusedTableCalculations(input).unusedTableCalculations.length > 0;
}
