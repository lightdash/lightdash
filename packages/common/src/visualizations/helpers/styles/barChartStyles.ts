/* eslint-disable no-plusplus */
/* eslint-disable no-continue */
import { type AnyType } from '../../../types/any';
import { type RawResultRow, type ResultRow } from '../../../types/results';
import { CartesianSeriesType } from '../../../types/savedCharts';
import { type EChartsSeries, type SqlRunnerEChartsSeries } from '../../types';
import { GRAY_9 } from './themeColors';

/**
 * Calculate dynamic border radius based on estimated bar width
 * @param dataPointCount - Number of data points (categories) in the chart
 * @param seriesCount - Number of bar series (non-stacked bars in same category)
 * @param isStacked - Whether bars are stacked
 * @param isHorizontal - Whether the bar chart is horizontal (flipAxes)
 * @returns Appropriate border radius (max 4px, scales down for thin bars)
 */
export const calculateDynamicBorderRadius = (
    dataPointCount: number,
    seriesCount: number,
    isStacked: boolean,
    isHorizontal: boolean = false,
): number => {
    // Estimate relative bar width/height based on number of categories and series
    // Assumptions: typical chart is ~600px wide, horizontal charts use ~200px height (1/3), barCategoryGap 25%
    const estimatedChartSize = isHorizontal ? 200 : 600;
    const barCategoryGap = 0.25;

    const categorySize = estimatedChartSize / dataPointCount;

    // Size for bars (after gap)
    const barGroupSize = categorySize * (1 - barCategoryGap);

    // Individual bar size (stacked bars share size, non-stacked split it)
    const barSize = isStacked ? barGroupSize : barGroupSize / seriesCount;

    // Calculate radius as percentage of bar size (15%), capped at 4px minimum 2px
    const dynamicRadius = Math.max(2, Math.min(4, barSize * 0.15));

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
export const getBarTotalLabelStyle = () => ({
    color: GRAY_9,
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
    enc: EChartsSeries['encode'] | SqlRunnerEChartsSeries['encode'],
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
 * Apply rounded corners to stacked bars for SQL Runner (flat data format)
 * SQL Runner data is flat: { field: value } instead of { field: { value: { raw: value } } }
 */
export const applyRoundedCornersToSqlRunnerStackData = (
    series: SqlRunnerEChartsSeries[],
    rows: RawResultRow[],
    {
        radius = 4,
        isHorizontal = false,
        legendSelected,
    }: {
        radius?: number;
        isHorizontal?: boolean;
        legendSelected?: { [name: string]: boolean } | undefined;
    } = {},
): SqlRunnerEChartsSeries[] => {
    const out = series.map((s) => ({ ...s }));
    const indexMap = new Map<SqlRunnerEChartsSeries, number>();
    series.forEach((s, i) => indexMap.set(s, i));

    const isVisible = (s: SqlRunnerEChartsSeries) => {
        if (!legendSelected) return true;
        const name =
            s.name || (Array.isArray(s.dimensions) ? s.dimensions[1] : '');
        if (!name) return true;
        return legendSelected[name] ?? true;
    };

    const getDimNames = (s: SqlRunnerEChartsSeries) =>
        (s.dimensions || []).filter(Boolean) as string[];

    const getHashFromEncode = (s: SqlRunnerEChartsSeries, which: 'x' | 'y') =>
        (s.encode?.[which] as string | undefined) || undefined;

    // Only stacked BAR series
    const stacks: Record<string, SqlRunnerEChartsSeries[]> = {};
    series.forEach((s) => {
        if (s.type === 'bar' && s.stack) {
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

            const valHash = isHorizontal
                ? getHashFromEncode(s, 'x')
                : getHashFromEncode(s, 'y');
            for (let r = 0; r < rows.length; r++) {
                // SQL Runner uses flat format: row[field] directly
                const raw = valHash ? rows[r]?.[valHash] : undefined;
                let v: number | null = null;
                if (typeof raw === 'number') {
                    v = raw;
                } else if (Number.isFinite(Number(raw))) {
                    v = Number(raw);
                }
                if (v == null || v === 0) continue;
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
                const catHash = isHorizontal ? yHash : xHash;
                const valHash = isHorizontal ? xHash : yHash;

                // SQL Runner uses flat format
                const cat = catHash ? row[catHash] : undefined;
                const raw = valHash ? row[valHash] : undefined;
                let v: number | null = null;
                if (typeof raw === 'number') {
                    v = raw;
                } else if (Number.isFinite(Number(raw))) {
                    v = Number(raw);
                }

                const value: AnyType[] = [];
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

                let borderRadius: number | number[] = 0;
                if (isHorizontal) {
                    borderRadius = isTopPos
                        ? [0, radius, radius, 0]
                        : [radius, 0, 0, radius];
                } else {
                    borderRadius = isTopPos
                        ? [radius, radius, 0, 0]
                        : [0, 0, radius, radius];
                }

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
 * @param rows Result rows aligned with the chart categories (Explorer format with nested values)
 * @param options.radius Corner radius in px (default: 4)
 * @param options.isHorizontal Whether the chart is horizontal (flipAxes)
 * @param options.legendSelected Map of legend selection states used to ignore hidden series
 * @returns New series array with `itemStyle.borderRadius` applied to end segments only
 *
 */
export const applyRoundedCornersToStackData = (
    series: EChartsSeries[],
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
): EChartsSeries[] => {
    const out = series.map((s) => ({ ...s }));
    const indexMap = new Map<EChartsSeries, number>();
    series.forEach((s, i) => indexMap.set(s, i));

    const isVisible = (s: EChartsSeries) => {
        if (!legendSelected) return true;
        const name = s.name || s.dimensions?.[1]?.displayName || '';
        if (!name) return true;
        return legendSelected[name] ?? true;
    };

    const getDimNames = (s: EChartsSeries) =>
        (s.dimensions || [])
            .map((d) => (typeof d === 'string' ? d : d?.name))
            .filter(Boolean) as string[];

    const getHashFromEncode = (s: EChartsSeries, which: 'x' | 'y') =>
        (s.encode?.[which] as string | undefined) || undefined;

    // Only stacked BAR series
    const stacks: Record<string, EChartsSeries[]> = {};
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
                let v: number | null = null;
                if (typeof raw === 'number') {
                    v = raw;
                } else if (Number.isFinite(Number(raw))) {
                    v = Number(raw);
                }
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
                let v: number | null = null;
                if (typeof raw === 'number') {
                    v = raw;
                } else if (Number.isFinite(Number(raw))) {
                    v = Number(raw);
                }

                // Place values at the correct tuple indices
                const value: AnyType[] = [];
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

                let borderRadius: number | number[] = 0;
                if (isHorizontal) {
                    borderRadius = isTopPos
                        ? [0, radius, radius, 0] // round right side for +X
                        : [radius, 0, 0, radius]; // round left side for -X
                } else {
                    borderRadius = isTopPos
                        ? [radius, radius, 0, 0] // round top for +Y
                        : [0, 0, radius, radius]; // round bottom for -Y
                }

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
