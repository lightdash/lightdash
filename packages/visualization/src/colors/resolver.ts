import {
    ChartType,
    type ChartConfig,
    type ItemsMap,
    type PivotValue,
    type Series,
} from '@lightdash/common';
import {
    calculateKeyColorAssignment,
    calculateSeriesColorAssignment,
    type ColorAssignmentOptions,
} from './mappings';
import {
    calculateFallbackSeriesColors,
    calculateSeriesLikeIdentifier,
    getDimensionValueColor,
    isGroupedSeries,
    type SeriesLike,
} from './series';

export type SeriesColorResolver = {
    /** A shared color for a series, from its own color, the chart metadata, a dimension value color, the shared mappings or the palette by order. */
    getSeriesColor: (seriesLike: SeriesLike) => string;
    /** A shared color for a group value; pie, funnel, treemap and sankey use it. */
    getGroupColor: (groupPrefix: string, identifier: string) => string;
};

export type SeriesColorResolverOptions = ColorAssignmentOptions & {
    chartConfig: ChartConfig | undefined;
    itemsMap: ItemsMap | undefined;
    /**
     * On dashboards the series of every tile are known up front and passed
     * here so the fallback colors line up across tiles; on a chart they come
     * from the chart config.
     */
    computedSeries?: Series[];
    /**
     * Whether grouped series take a shared, first-come color from the
     * mappings (the `CalculateSeriesColor` feature flag) instead of the
     * palette color for their position.
     */
    calculateSeriesColor?: boolean;
};

/**
 * Builds the two color lookups every chart builder takes.
 *
 * Fallback colors are pre-calculated per series from the chart config, in
 * descending identifier order, and re-calculated when the series change.
 */
export const createSeriesColorResolver = ({
    colorPalette,
    colorMappings,
    nullColor,
    chartConfig,
    itemsMap,
    computedSeries,
    calculateSeriesColor = false,
}: SeriesColorResolverOptions): SeriesColorResolver => {
    const assignment: ColorAssignmentOptions = {
        colorPalette,
        colorMappings,
        nullColor,
    };

    const fallbackColors: Record<string, string> = (() => {
        if (!chartConfig?.config || chartConfig.type !== ChartType.CARTESIAN) {
            return {};
        }

        const allSeries =
            computedSeries && computedSeries.length > 0
                ? computedSeries
                : chartConfig.config.eChartsConfig.series;

        return calculateFallbackSeriesColors(allSeries ?? [], colorPalette);
    })();

    const metadata =
        chartConfig?.type === ChartType.CARTESIAN
            ? chartConfig.config?.metadata
            : undefined;

    const getGroupColor = (groupPrefix: string, identifier: string) => {
        if (itemsMap) {
            const fixedColor = getDimensionValueColor(
                itemsMap,
                groupPrefix,
                identifier,
            );
            if (fixedColor) return fixedColor;
        }

        return calculateKeyColorAssignment(assignment, groupPrefix, identifier);
    };

    const getSeriesColor = (seriesLike: SeriesLike): string => {
        if (seriesLike.color) return seriesLike.color;

        // Check if color is stored in metadata
        const serieId = calculateSeriesLikeIdentifier(seriesLike).join('.');
        const metadataColor = metadata?.[serieId]?.color;
        if (metadataColor) {
            return metadataColor;
        }

        /** Check if color is set in the dimension metadata */

        let pivot: PivotValue | undefined;
        if ('pivotReference' in seriesLike && seriesLike.pivotReference) {
            pivot = seriesLike.pivotReference.pivotValues?.[0];
        } else if (seriesLike.encode && 'yRef' in seriesLike.encode) {
            pivot = seriesLike.encode.yRef?.pivotValues?.[0];
        }
        if (itemsMap && pivot) {
            const { field, value } = pivot;
            const fixedColor = getDimensionValueColor(itemsMap, field, value);
            if (fixedColor) return fixedColor;
        }

        /**
         * If this series is grouped, figure out a shared color assignment from the series;
         * otherwise, pick a series color from the palette based on its order.
         */
        return isGroupedSeries(seriesLike) && calculateSeriesColor
            ? calculateSeriesColorAssignment(assignment, seriesLike)
            : fallbackColors[
                  // Note: we don't use getSeriesId since we may not be dealing with a Series type here
                  calculateSeriesLikeIdentifier(seriesLike).join('|')
              ];
    };

    return { getSeriesColor, getGroupColor };
};
