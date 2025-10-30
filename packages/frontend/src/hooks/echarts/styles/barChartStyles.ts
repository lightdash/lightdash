import { type ResultRow } from '@lightdash/common';
import { type MantineTheme } from '@mantine/core';
import groupBy from 'lodash/groupBy';
import { type EChartSeries } from '../useEchartsCartesianConfig';

/**
 * Calculate dynamic border radius based on estimated bar width
 * @param dataPointCount - Number of data points (categories) in the chart
 * @param seriesCount - Number of bar series (non-stacked bars in same category)
 * @param isStacked - Whether bars are stacked
 * @returns Appropriate border radius (max 4px, scales down for thin bars)
 */
export const calculateDynamicBorderRadius = (
    dataPointCount: number,
    seriesCount: number,
    isStacked: boolean,
): number => {
    // Estimate relative bar width based on number of categories and series
    // Assumptions: typical chart is ~600px wide, barCategoryGap is 25%
    const estimatedChartWidth = 600;
    const barCategoryGap = 0.25;

    // Width available per category
    const categoryWidth = estimatedChartWidth / dataPointCount;

    // Width for bars (after gap)
    const barGroupWidth = categoryWidth * (1 - barCategoryGap);

    // Individual bar width (stacked bars share width, non-stacked split it)
    const barWidth = isStacked ? barGroupWidth : barGroupWidth / seriesCount;

    // Calculate radius as percentage of bar width (15%), capped at 4px minimum 2px
    const dynamicRadius = Math.max(1, Math.min(4, barWidth * 0.15));

    return Math.round(dynamicRadius);
};

/**
 * Get border radius array for a bar chart data point
 * @param isHorizontal - Whether the bar chart is horizontal (flipAxes)
 * @param isStackEnd - Whether this data point is at the end (top/right) of the stack
 * @param radius - The border radius value to apply
 */
export const getBarBorderRadius = (
    isHorizontal: boolean,
    isStackEnd: boolean,
    radius: number = 4,
): number | number[] => {
    if (!isStackEnd) {
        return 0;
    }

    // Horizontal (flipAxes): round right side [top-right, bottom-right, bottom-left, top-left]
    // Vertical: round top side [top-left, top-right, bottom-right, bottom-left]
    return isHorizontal ? [0, radius, radius, 0] : [radius, radius, 0, 0];
};

/**
 * Get base bar styling configuration for cartesian charts
 */
export const getBarStyle = () => ({
    barCategoryGap: '25%', // Gap between bars: width is 3x the gap (75% / 25% = 3)
});

/**
 * Get bar total label styling (values above/beside stacked bars)
 * This is specifically for stack totals, not individual bar labels
 */
export const getBarTotalLabelStyle = (theme: MantineTheme) => ({
    color: theme.colors.gray[9],
    fontWeight: '500',
    fontSize: 11,
});

/**
 * Apply border radius to the top of stacked bar series
 * Ref: https://github.com/apache/echarts/issues/12319#issuecomment-1341387601
 *
 * @param allSeries - All series (stacked and non-stacked)
 * @param stackedBarSeries - Filtered array of stacked bar series to process
 * @param rows - Result rows containing the data
 * @param isHorizontal - Whether the chart is horizontal (flipAxes)
 * @param dynamicRadius - The border radius value to apply
 * @returns New array of all series with border radius applied to stacked bars
 */
export const applyStackedBarBorderRadius = (
    allSeries: EChartSeries[],
    stackedBarSeries: EChartSeries[],
    rows: ResultRow[],
    isHorizontal: boolean,
    dynamicRadius: number,
): EChartSeries[] => {
    if (stackedBarSeries.length === 0) return allSeries;

    const seriesDataMap = new Map<EChartSeries, unknown[]>();

    const seriesByStack = groupBy(stackedBarSeries, 'stack');

    Object.values(seriesByStack).forEach((stackSeries) => {
        for (let dataIndex = 0; dataIndex < rows.length; dataIndex++) {
            // Find the topmost series with data at this index
            const topSeries = stackSeries.findLast((serie) => {
                const valueFieldHash = isHorizontal
                    ? serie.encode?.x
                    : serie.encode?.y;

                if (!valueFieldHash) return false;

                const rawValue = rows[dataIndex]?.[valueFieldHash]?.value?.raw;
                return (
                    rawValue !== null &&
                    rawValue !== undefined &&
                    rawValue !== '-'
                );
            });

            // Apply border radius to the top series at this data point
            if (topSeries) {
                const valueFieldHash = isHorizontal
                    ? topSeries.encode?.x
                    : topSeries.encode?.y;

                if (!valueFieldHash) continue;

                // Lazy initialize data array for this series
                if (!seriesDataMap.has(topSeries)) {
                    seriesDataMap.set(
                        topSeries,
                        rows.map((row) => row[valueFieldHash]?.value?.raw),
                    );
                }

                const dataArray = seriesDataMap.get(topSeries)!;
                const value = rows[dataIndex][valueFieldHash]?.value?.raw;
                dataArray[dataIndex] = {
                    value,
                    itemStyle: {
                        borderRadius: getBarBorderRadius(
                            isHorizontal,
                            true,
                            dynamicRadius,
                        ),
                    },
                };
            }
        }
    });

    // Return all series, with border radius applied to modified ones
    return allSeries.map((serie) => {
        const dataArray = seriesDataMap.get(serie);
        if (dataArray) {
            return {
                ...serie,
                data: dataArray,
            };
        }
        return serie;
    });
};

/**
 * Apply category data to axes when using stacked bar data arrays
 * When stacked bars use data arrays (for border radius), ECharts requires explicit category data on the category axis
 *
 * @param axes - Current axis configuration
 * @param series - All series (to check if any use data arrays)
 * @param rows - Result rows containing category values
 * @param isFlipAxes - Whether the chart is horizontal (flipAxes)
 * @param categoryFieldHash - The field hash for category values
 * @returns Modified axes with category data if needed, otherwise original axes
 */
export const applyStackedBarCategoryData = (
    axes: { xAxis: any[]; yAxis: any[] },
    series: EChartSeries[],
    rows: ResultRow[],
    isFlipAxes: boolean,
    categoryFieldHash: string | undefined,
): { xAxis: any[]; yAxis: any[] } => {
    // Check if any series are using data arrays (stacked bars with border radius)
    const hasDataArraySeries = series.some((s) => s.data !== undefined);

    if (!hasDataArraySeries || !categoryFieldHash) {
        return axes; // No modification needed
    }

    // Extract category values from rows
    const categoryData = rows.map((row) => row[categoryFieldHash]?.value?.raw);

    // Add category data to the appropriate axis
    if (isFlipAxes) {
        // Horizontal: categories on y-axis
        return {
            xAxis: axes.xAxis,
            yAxis: axes.yAxis.map((axis, idx) =>
                idx === 0
                    ? ({ ...axis, data: categoryData } as typeof axis)
                    : axis,
            ),
        };
    } else {
        // Vertical: categories on x-axis
        return {
            xAxis: axes.xAxis.map((axis, idx) =>
                idx === 0
                    ? ({ ...axis, data: categoryData } as typeof axis)
                    : axis,
            ),
            yAxis: axes.yAxis,
        };
    }
};
