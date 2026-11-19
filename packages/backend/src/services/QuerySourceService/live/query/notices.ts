import {
    getItemLabelWithoutTableName,
    getItemMap,
    type Explore,
    type LiveResultNotice,
    type MetricQuery,
} from '@lightdash/common';
import { splitDateRangeFilter } from './dateRange';

const formatCount = (count: number) =>
    new Intl.NumberFormat('en-US').format(count);

/** Rows past the ones returned: by the query's limit, or by maxRows, the most one query can return (the integration's or the instance's cap, whichever is lower). */
export const getTruncatedNotice = ({
    label,
    rowCount,
    maxRows,
}: {
    label: string;
    rowCount: number;
    maxRows: number;
}): LiveResultNotice => ({
    type: 'truncated',
    rowCount,
    message:
        rowCount >= maxRows
            ? `Showing the first ${formatCount(rowCount)} rows, the most one query can return. ${label} has more: add filters to see the rest.`
            : `Showing the first ${formatCount(rowCount)} rows. ${label} has more: raise the row limit or add filters to see the rest.`,
});

/** The source's default date window, when the query doesn't filter its date. */
export const getDefaultDateWindowNotice = (
    explore: Explore,
    metricQuery: Pick<MetricQuery, 'filters'>,
): LiveResultNotice | null => {
    const dateRange = explore.apiSource?.dateRange;
    if (!dateRange) {
        return null;
    }
    const { dateRule } = splitDateRangeFilter(
        metricQuery.filters.dimensions,
        dateRange.fieldId,
    );
    if (dateRule) {
        return null;
    }
    const item = getItemMap(explore)[dateRange.fieldId];
    const label = item ? getItemLabelWithoutTableName(item) : 'date';
    return {
        type: 'defaultDateWindow',
        fieldId: dateRange.fieldId,
        days: dateRange.defaultDays,
        message: `No ${label} filter, so this shows the last ${dateRange.defaultDays} full days. Filter on ${label} to choose the dates.`,
    };
};
