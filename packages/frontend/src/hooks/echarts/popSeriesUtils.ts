import {
    CartesianSeriesType,
    getBaseFieldIdFromPop,
    type EChartsSeries,
    type PeriodOverPeriodComparison,
    type ResultColumns,
} from '@lightdash/common';
import { getLuminance, lighten } from 'polished';

const POP_MAX_LIGHTEN = 0.25;
const POP_MIN_LIGHTEN = 0.01;

/**
 * Compute a lightened color for PoP series, scaling the amount
 * inversely to the original color's luminance.
 * Dark colors get more lightening, light colors get less.
 */
const computePopColor = (color: string): string => {
    const luminance = getLuminance(color);
    const scaledAmount = POP_MAX_LIGHTEN * (1 - luminance);
    return lighten(Math.max(POP_MIN_LIGHTEN, scaledAmount), color);
};

/**
 * Builds a map of base field ID -> PoP field ID using popMetadata from ResultColumns.
 * This uses the explicit API metadata rather than relying on naming conventions.
 */
const buildPopFieldsMap = (
    resultsColumns: ResultColumns | undefined,
): Map<string, string> => {
    const popFieldsByBase = new Map<string, string>();

    if (!resultsColumns) return popFieldsByBase;

    for (const [fieldId, column] of Object.entries(resultsColumns)) {
        if (column.popMetadata) {
            popFieldsByBase.set(column.popMetadata.baseFieldId, fieldId);
        }
    }

    return popFieldsByBase;
};

/**
 * Builds a human-readable period label based on granularity and offset
 * e.g., "Previous month" or "2 months ago"
 */
const buildPeriodLabel = (
    periodOffset: number,
    granularity: string,
): string => {
    return periodOffset === 1
        ? `Previous ${granularity.toLowerCase()}`
        : `${periodOffset} ${granularity.toLowerCase()}s ago`;
};

// ============================================================================
// Series Creation Utilities
// ============================================================================

type CreatePopSeriesArgs = {
    baseSerie: EChartsSeries;
    baseSeriesIndex: number;
    previousFieldKey: string;
    periodLabel: string;
    periodOffset: number;
    granularity: string;
    yField: string;
};

/**
 * Creates a PoP series based on a base series
 * Applies visual distinction (dashed lines, transparent bars, etc.)
 */
const createPopSeries = ({
    baseSerie,
    baseSeriesIndex,
    previousFieldKey,
    periodLabel,
    periodOffset,
    granularity,
    yField,
}: CreatePopSeriesArgs): EChartsSeries => {
    const metricDisplayName =
        baseSerie.dimensions?.[1]?.displayName || baseSerie.name || yField;

    const xField = baseSerie.encode?.x;
    const seriesType = baseSerie.type || CartesianSeriesType.LINE;
    const isBarType = seriesType === CartesianSeriesType.BAR;
    const isLineType = seriesType === CartesianSeriesType.LINE;
    const isAreaChart = isLineType && !!baseSerie.areaStyle;

    return {
        ...baseSerie,
        name: `${metricDisplayName} (${periodLabel})`,
        encode: {
            x: xField!,
            y: previousFieldKey,
            tooltip: [previousFieldKey],
            seriesName: previousFieldKey,
            // Preserve xRef and yRef from original series for color config
            xRef: baseSerie.encode?.xRef,
            yRef: baseSerie.encode?.yRef
                ? {
                      ...baseSerie.encode.yRef,
                      field: previousFieldKey,
                  }
                : { field: previousFieldKey },
        },
        // Keep same type as sibling
        type: seriesType,
        // For bars: remove gap between PoP bar and its sibling for tighter grouping
        ...(isBarType && {
            barGap: '0%',
        }),
        // Style based on chart type for visual distinction
        ...(isLineType &&
            !isAreaChart && {
                lineStyle: {
                    type: 'dashed',
                    width: 1.4,
                },
            }),
        ...(isAreaChart && {
            areaStyle: {
                ...baseSerie.areaStyle,
            },
            lineStyle: {
                type: 'dashed',
                width: 1.4,
            },
        }),
        // Remove area style only for non-area line charts
        ...(!isAreaChart && { areaStyle: undefined }),
        // Update dimensions for tooltip
        dimensions: [
            baseSerie.dimensions?.[0] || {
                name: xField!,
                displayName: baseSerie.dimensions?.[0]?.displayName || '',
            },
            {
                name: previousFieldKey,
                displayName: `${metricDisplayName} (${periodLabel})`,
            },
        ],
        // Show symbols for line types (not area)
        ...(isLineType &&
            !isAreaChart && {
                showSymbol: false,
            }),
        // Metadata for period-over-period: link to sibling series index
        periodOverPeriodMetadata: {
            siblingSeriesIndex: baseSeriesIndex,
            periodOffset,
            granularity,
            baseFieldId: yField,
        },
    };
};

// ============================================================================
// Series Interleaving
// ============================================================================

type PreviousSeriesEntry = {
    index: number;
    series: EChartsSeries;
};

/**
 * Interleaves PoP series with their base series siblings.
 * For bars: previous comes BEFORE current (appears on left)
 * For others: previous comes AFTER current
 */
const interleaveSeries = (
    baseSeries: EChartsSeries[],
    previousSeriesList: PreviousSeriesEntry[],
): EChartsSeries[] => {
    const result: EChartsSeries[] = [];

    baseSeries.forEach((serie, idx) => {
        const previousEntry = previousSeriesList.find((p) => p.index === idx);
        const isBarType = serie.type === CartesianSeriesType.BAR;

        if (previousEntry && isBarType) {
            // For bars: previous first, then current
            result.push(previousEntry.series);
            result.push(serie);
        } else {
            // For other types: current first, then previous
            result.push(serie);
            if (previousEntry) {
                result.push(previousEntry.series);
            }
        }
    });

    return result;
};

// ============================================================================
// Main PoP Series Generation
// ============================================================================

type GeneratePopSeriesArgs = {
    baseSeries: EChartsSeries[];
    periodOverPeriod: PeriodOverPeriodComparison;
    /** Result columns from API containing popMetadata */
    resultsColumns: ResultColumns | undefined;
    metrics: string[];
};

/**
 * Generates period-over-period comparison series for ECharts.
 * Creates visually distinct series (dashed lines, semi-transparent bars)
 * for the previous period data and interleaves them with base series.
 *
 * Uses popMetadata from ResultColumns to identify PoP relationships.
 *
 * @returns The combined series array with PoP series interleaved
 */
export const generatePopSeries = ({
    baseSeries,
    periodOverPeriod,
    resultsColumns,
    metrics,
}: GeneratePopSeriesArgs): EChartsSeries[] => {
    const popFieldsByBase = buildPopFieldsMap(resultsColumns);

    // If no PoP columns found in metadata, return base series unchanged
    if (popFieldsByBase.size === 0) return baseSeries;

    const periodOffset = periodOverPeriod.periodOffset ?? 1;
    const { granularity } = periodOverPeriod;
    const periodLabel = buildPeriodLabel(periodOffset, granularity);

    const previousSeriesList: PreviousSeriesEntry[] = [];

    baseSeries.forEach((serie, index) => {
        // Skip series without proper encode configuration
        const xField = serie.encode?.x;
        const yField = serie.encode?.y;
        if (!xField || !yField) return;
        if (!metrics.includes(yField)) return;

        // Check if PoP column exists for this metric
        const previousFieldKey = popFieldsByBase.get(yField);
        if (!previousFieldKey) return;

        const popSeries = createPopSeries({
            baseSerie: serie,
            baseSeriesIndex: index,
            previousFieldKey,
            periodLabel,
            periodOffset,
            granularity,
            yField,
        });

        previousSeriesList.push({ index, series: popSeries });
    });

    return interleaveSeries(baseSeries, previousSeriesList);
};

// ============================================================================
// Color Assignment for PoP Series
// ============================================================================

type ApplyPopColorsArgs = {
    series: EChartsSeries[];
    getSeriesColor: (serie: EChartsSeries) => string;
};

/**
 * Computes colors for all series, applying a lightened color to PoP series
 * to create visual distinction while maintaining color consistency with siblings.
 *
 * @returns Array of computed colors matching series order
 */
export const computeSeriesColorsWithPop = ({
    series,
    getSeriesColor,
}: ApplyPopColorsArgs): string[] => {
    const baseColors = series.map((serie) => getSeriesColor(serie));

    return series.map((serie, index) => {
        if (serie.periodOverPeriodMetadata) {
            // Find sibling by matching field name (without _previous suffix)
            const previousField = serie.encode?.y;
            if (!previousField) return baseColors[index];
            const baseField = getBaseFieldIdFromPop(previousField);
            const siblingIdx = series.findIndex(
                (s) => s.encode?.y === baseField && !s.periodOverPeriodMetadata,
            );
            const siblingColor =
                siblingIdx >= 0 ? baseColors[siblingIdx] : undefined;
            const colorToUse = siblingColor || baseColors[index];
            if (!colorToUse) {
                console.error('No color to use for series', serie);
                return baseColors[index];
            }
            return computePopColor(colorToUse);
        }

        return baseColors[index];
    });
};
