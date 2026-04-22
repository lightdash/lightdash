import {
    isDimension,
    TimeFrames,
    type CartesianChart,
    type ItemsMap,
} from '@lightdash/common';
import dayjs from 'dayjs';
import timezonePlugin from 'dayjs/plugin/timezone';
import utcPlugin from 'dayjs/plugin/utc';

dayjs.extend(utcPlugin);
dayjs.extend(timezonePlugin);

export const TIME_INTERVALS_FOR_CATEGORY_AXIS: TimeFrames[] = [
    TimeFrames.WEEK,
    TimeFrames.MONTH,
    TimeFrames.QUARTER,
    TimeFrames.YEAR,
];

export type TimezoneShiftedField = {
    fieldId: string;
    timezone: string;
};

const getTimezoneOffsetMs = (ms: number, timezone: string): number =>
    dayjs(ms).tz(timezone).utcOffset() * 60_000;

const shiftMsToTimezoneWallClock = (ms: number, timezone: string): number =>
    ms + getTimezoneOffsetMs(ms, timezone);

export const detectTimezoneShiftedField = ({
    validCartesianConfig,
    itemsMap,
    resolvedTimezone,
}: {
    validCartesianConfig: CartesianChart | undefined;
    itemsMap: ItemsMap | undefined;
    resolvedTimezone: string | undefined;
}): TimezoneShiftedField | undefined => {
    if (
        !resolvedTimezone ||
        resolvedTimezone === 'UTC' ||
        !validCartesianConfig ||
        !itemsMap
    ) {
        return undefined;
    }
    const flipAxes = !!validCartesianConfig.layout?.flipAxes;
    const timeFieldId = flipAxes
        ? validCartesianConfig.layout?.yField?.[0]
        : validCartesianConfig.layout?.xField;
    if (!timeFieldId) return undefined;
    const field = itemsMap[timeFieldId];
    if (!field || !isDimension(field) || !field.timeInterval) {
        return undefined;
    }
    if (
        TIME_INTERVALS_FOR_CATEGORY_AXIS.includes(
            field.timeInterval as TimeFrames,
        )
    ) {
        return undefined;
    }
    return { fieldId: timeFieldId, timezone: resolvedTimezone };
};

type ShiftableCell = { value?: { raw?: unknown } } | undefined;
type ShiftableRow = Record<string, ShiftableCell>;

export const applyTimezoneShiftToRows = <R extends ShiftableRow>(
    rows: R[],
    fieldId: string,
    timezone: string,
): R[] =>
    rows.map((row) => {
        const cell = row[fieldId];
        const raw = cell?.value?.raw;
        if (raw === null || raw === undefined) return row;
        const ms =
            typeof raw === 'number' ? raw : new Date(String(raw)).getTime();
        if (!Number.isFinite(ms)) return row;
        return {
            ...row,
            [fieldId]: {
                ...cell,
                value: {
                    ...cell?.value,
                    raw: shiftMsToTimezoneWallClock(ms, timezone),
                },
            },
        };
    });
