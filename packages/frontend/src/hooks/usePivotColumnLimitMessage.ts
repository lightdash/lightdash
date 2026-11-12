import {
    ChartType,
    type ChartConfig,
    type PivotValuesColumn,
} from '@lightdash/common';
import useApp from '../providers/App/useApp';

type PivotColumnLimitDetails =
    | {
          totalColumnCount: number | null | undefined;
          valuesColumns?: PivotValuesColumn[];
      }
    | null
    | undefined;

/**
 * True when the groups past the column limit were added together into an
 * "Other" group instead of being dropped (stacked charts).
 */
export const hasOtherPivotGroup = (
    valuesColumns: PivotValuesColumn[] | undefined,
): boolean =>
    (valuesColumns ?? []).some((column) => column.isOtherGroup === true);

/** The chart's own "Column limit" setting (cartesian charts). */
export const getChartColumnLimit = (
    chartConfig: ChartConfig | undefined,
): number | undefined =>
    chartConfig?.type === ChartType.CARTESIAN
        ? chartConfig.config?.columnLimit
        : undefined;

/**
 * True when the chart's own Column limit shows no more groups than the
 * results hold. The user then chose what is shown, so the groups the server
 * left out make no difference to the chart and need no warning.
 * The server limit is shared between the chart's metrics.
 */
export const isWithinChartColumnLimit = ({
    chartColumnLimit,
    maxColumnLimit,
    valuesColumns,
}: {
    chartColumnLimit: number | undefined;
    maxColumnLimit: number | undefined;
    valuesColumns: PivotValuesColumn[] | undefined;
}): boolean => {
    if (!chartColumnLimit || chartColumnLimit <= 0 || !maxColumnLimit) {
        return false;
    }
    const metricCount =
        new Set((valuesColumns ?? []).map((column) => column.referenceField))
            .size || 1;
    return chartColumnLimit <= Math.floor(maxColumnLimit / metricCount);
};

/**
 * Grouped (pivoted) queries return at most `maxColumnLimit` columns. Unless
 * the rest were folded into an "Other" group, groups past the limit are left
 * out of the results, so anything summed over them comes out lower than the
 * real total.
 */
export const getPivotColumnLimitMessage = ({
    totalColumnCount,
    maxColumnLimit,
    hasOtherGroup = false,
}: {
    totalColumnCount: number | null | undefined;
    maxColumnLimit: number | undefined;
    hasOtherGroup?: boolean;
}): string | null => {
    if (!totalColumnCount || !maxColumnLimit) return null;
    if (totalColumnCount <= maxColumnLimit) return null;
    if (hasOtherGroup) {
        return `This chart has ${totalColumnCount} grouped columns. The first ${maxColumnLimit} are shown and the rest are added together as "Other".`;
    }
    return `Results limited to ${maxColumnLimit} of ${totalColumnCount} columns. Filter the chart or group by a field with fewer values to show all results.`;
};

/**
 * Warning for a dashboard tile whose results dropped groups. Returns null when
 * nothing was dropped, including when the rest were folded into "Other": the
 * chart is then complete and the "Other" segment explains itself.
 */
export const usePivotColumnLimitMessage = (
    pivotDetails: PivotColumnLimitDetails,
    chartConfig?: ChartConfig,
): string | null => {
    const { health } = useApp();
    if (hasOtherPivotGroup(pivotDetails?.valuesColumns)) return null;
    if (
        isWithinChartColumnLimit({
            chartColumnLimit: getChartColumnLimit(chartConfig),
            maxColumnLimit: health.data?.pivotTable?.maxColumnLimit,
            valuesColumns: pivotDetails?.valuesColumns,
        })
    ) {
        return null;
    }
    return getPivotColumnLimitMessage({
        totalColumnCount: pivotDetails?.totalColumnCount,
        maxColumnLimit: health.data?.pivotTable?.maxColumnLimit,
    });
};
