import { CartesianSeriesType, type ResultRow } from '@lightdash/common';
import { type MantineTheme } from '@mantine/core';
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
 * Resolve the tuple index for x/y given encode + dimensions
 * @param enc - The encode object
 * @param dimNames - The dimension names
 * @param which - The axis to resolve the index for
 * @returns The index of the axis
 */
export const getIndexFromEncode = (
    enc: EChartSeries['encode'],
    dimNames: string[] | undefined,
    which: 'x' | 'y',
): number | undefined => {
    const e = enc?.[which];
    if (typeof e === 'number') return e;
    if (Array.isArray(e)) return typeof e[0] === 'number' ? e[0] : undefined;
    if (typeof e === 'string') {
        const idx = dimNames ? dimNames.indexOf(e) : undefined;
        return idx != null && idx >= 0 ? idx : undefined;
    }
    return undefined;
};

type LegendValues = { [name: string]: boolean } | undefined;

/**
 * Apply rounded corners to the visible end-segments of stacked bar series.
 * Ref: https://github.com/apache/echarts/issues/12319#issuecomment-1341387601
 *
 * Process:
 * - For each stack and each category (row), finds which segment is visually at the end of the stack
 *   (top-most for positive values, bottom-most for negative values).
 * - Annotates only those segments with `itemStyle.borderRadius`, considering chart orientation
 *   and legend visibility.
 * - We scan from top to bottom of the stack using an index-based loop so the first visible segment
 *   per category "wins" without extra allocations.
 *
 * @param series ECharts series produced for a cartesian chart
 * @param rows Result rows aligned with the chart categories
 * @param options.radius Corner radius in px (default: 4)
 * @param options.isHorizontal Whether the chart is horizontal (flipAxes)
 * @param options.legendSelected Map of legend selection states used to ignore hidden series
 * @returns New series array with `itemStyle.borderRadius` applied to end segments only
 *
 */
export const applyRoundedCornersToStackData = (
    series: EChartSeries[],
    rows: ResultRow[],
    {
        radius = 4,
        isHorizontal = false,
        legendSelected,
    }: {
        radius?: number;
        isHorizontal?: boolean;
        legendSelected?: LegendValues;
    } = {},
): EChartSeries[] => {
    const out = series.map((s) => ({ ...s }));
    const indexMap = new Map<EChartSeries, number>();
    series.forEach((s, i) => indexMap.set(s, i));

    const isVisible = (s: EChartSeries) => {
        if (!legendSelected) return true;
        const name = s.name || s.dimensions?.[1]?.displayName || '';
        if (!name) return true;
        return legendSelected[name] ?? true;
    };

    const getDimNames = (s: EChartSeries) =>
        (s.dimensions || [])
            .map((d) => (typeof d === 'string' ? d : d?.name))
            .filter(Boolean) as string[];

    const getHashFromEncode = (s: EChartSeries, which: 'x' | 'y') =>
        (s.encode?.[which] as string | undefined) || undefined;

    // Only stacked BAR series
    const stacks: Record<string, EChartSeries[]> = {};
    series.forEach((s) => {
        if (s.type === CartesianSeriesType.BAR && s.stack) {
            (stacks[s.stack] ||= []).push(s);
        }
    });

    Object.values(stacks).forEach((group) => {
        if (!group.length) return;

        const topPosAt: number[] = rows.map(() => -1);
        const topNegAt: number[] = rows.map(() => -1);

        // Determine which series sits at the visible end for each category index
        for (let i = group.length - 1; i >= 0; i--) {
            const s = group[i];
            if (!isVisible(s)) continue;

            // Get the hash of the value field - if the chart is horizontal, it's the x field, otherwise it's the y field
            const valHash = isHorizontal
                ? getHashFromEncode(s, 'x')
                : getHashFromEncode(s, 'y');
            for (let r = 0; r < rows.length; r++) {
                const raw = valHash
                    ? rows[r]?.[valHash]?.value?.raw
                    : undefined;
                const v =
                    typeof raw === 'number'
                        ? raw
                        : Number.isFinite(Number(raw))
                        ? Number(raw)
                        : null;
                if (v == null || v === 0) continue;
                // Track the index of the series that is at the top of the stack for each category
                if (v > 0 && topPosAt[r] === -1) topPosAt[r] = i;
                if (v < 0 && topNegAt[r] === -1) topNegAt[r] = i;
            }
        }

        // Build data with tuple indices aligned to encode+dimensions
        group.forEach((s, gi) => {
            const outIdx = indexMap.get(s);
            if (outIdx === undefined) return;

            const dimNames = getDimNames(s);
            const xIdx = getIndexFromEncode(s.encode, dimNames, 'x') ?? 0;
            const yIdx = getIndexFromEncode(s.encode, dimNames, 'y') ?? 1;

            const xHash = getHashFromEncode(s, 'x');
            const yHash = getHashFromEncode(s, 'y');

            const data = rows.map((row, r) => {
                const catHash = isHorizontal ? yHash : xHash; // category field in data
                const valHash = isHorizontal ? xHash : yHash; // numeric field in data

                const cat = catHash ? row[catHash]?.value?.raw : undefined;
                const raw = valHash ? row[valHash]?.value?.raw : undefined;
                const v =
                    typeof raw === 'number'
                        ? raw
                        : Number.isFinite(Number(raw))
                        ? Number(raw)
                        : null;

                // Place values at the correct tuple indices
                const value: any[] = [];
                if (isHorizontal) {
                    value[xIdx] = v;
                    value[yIdx] = cat;
                } else {
                    value[xIdx] = cat;
                    value[yIdx] = v;
                }

                if (v == null) return { value };

                const isTopPos = v > 0 && topPosAt[r] === gi;
                const isTopNeg = v < 0 && topNegAt[r] === gi;
                if (!isTopPos && !isTopNeg) return { value };

                const borderRadius = isHorizontal
                    ? isTopPos
                        ? [0, radius, radius, 0] // round right side for +X
                        : [radius, 0, 0, radius] // round left side for -X
                    : isTopPos
                    ? [radius, radius, 0, 0] // round top for +Y
                    : [0, 0, radius, radius]; // round bottom for -Y

                return {
                    value,
                    itemStyle: { ...(s.itemStyle || {}), borderRadius },
                };
            });

            out[outIdx] = { ...out[outIdx], data };
        });
    });

    return out;
};
