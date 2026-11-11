import { isOtherPivotValue, type PivotValuesColumn } from '@lightdash/common';
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
    (valuesColumns ?? []).some((column) =>
        column.pivotValues.some((pivotValue) =>
            isOtherPivotValue(pivotValue.value),
        ),
    );

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
    return `Only the first ${maxColumnLimit} of ${totalColumnCount} grouped columns are shown. Totals leave out the rest. Filter the chart or group by a field with fewer values to see everything.`;
};

/**
 * Warning for a dashboard tile whose results dropped groups. Returns null when
 * nothing was dropped, including when the rest were folded into "Other": the
 * chart is then complete and the "Other" segment explains itself.
 */
export const usePivotColumnLimitMessage = (
    pivotDetails: PivotColumnLimitDetails,
): string | null => {
    const { health } = useApp();
    if (hasOtherPivotGroup(pivotDetails?.valuesColumns)) return null;
    return getPivotColumnLimitMessage({
        totalColumnCount: pivotDetails?.totalColumnCount,
        maxColumnLimit: health.data?.pivotTable?.maxColumnLimit,
    });
};
