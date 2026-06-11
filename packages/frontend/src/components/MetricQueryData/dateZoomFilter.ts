import {
    assertUnreachable,
    DateGranularity,
    FilterOperator,
    isStandardDateGranularity,
    type DateZoom,
    type FilterRule,
} from '@lightdash/common';
import dayjs, { type ManipulateType } from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { v4 as uuidv4 } from 'uuid';

dayjs.extend(utc);

// Quarter is 3 months; dayjs's base ManipulateType doesn't include 'quarter'
// without extending with the quarterOfYear plugin.
const dateGranularityToDayjsShift = (
    granularity: DateGranularity,
): [number, ManipulateType] => {
    switch (granularity) {
        case DateGranularity.SECOND:
            return [1, 'second'];
        case DateGranularity.MINUTE:
            return [1, 'minute'];
        case DateGranularity.HOUR:
            return [1, 'hour'];
        case DateGranularity.DAY:
            return [1, 'day'];
        case DateGranularity.WEEK:
            return [1, 'week'];
        case DateGranularity.MONTH:
            return [1, 'month'];
        case DateGranularity.QUARTER:
            return [3, 'month'];
        case DateGranularity.YEAR:
            return [1, 'year'];
        default:
            return assertUnreachable(granularity, 'Unknown DateGranularity');
    }
};

// Date zoom truncates the chart's x-axis dim to a period (e.g. week). The
// clicked value is already the period-start (from the warehouse's DATE_TRUNC),
// so EQUALS filter on the raw dim only matches that exact moment. Replace with
// a [start, nextStart) range so every row in the period is returned.
export const getZoomedDimFilter = (
    fieldId: string,
    raw: unknown,
    dateZoom: DateZoom | undefined,
): FilterRule[] | null => {
    if (
        raw === null ||
        !dateZoom?.granularity ||
        dateZoom.xAxisFieldId !== fieldId ||
        !isStandardDateGranularity(dateZoom.granularity)
    ) {
        return null;
    }
    const start = dayjs.utc(raw as dayjs.ConfigType);
    if (!start.isValid()) return null;
    const [amount, unit] = dateGranularityToDayjsShift(dateZoom.granularity);
    const nextStart = start.add(amount, unit);
    const isoFormat = 'YYYY-MM-DDTHH:mm:ss[Z]';
    return [
        {
            id: uuidv4(),
            target: { fieldId },
            operator: FilterOperator.GREATER_THAN_OR_EQUAL,
            values: [start.format(isoFormat)],
        },
        {
            id: uuidv4(),
            target: { fieldId },
            operator: FilterOperator.LESS_THAN,
            values: [nextStart.format(isoFormat)],
        },
    ];
};
