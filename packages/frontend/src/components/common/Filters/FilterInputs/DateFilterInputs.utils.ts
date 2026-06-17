import { formatDate, parseDate, TimeFrames } from '@lightdash/common';
import dayjs from 'dayjs';

type DateFilterValue = string | number | Date;

const isDateFilterValue = (value: unknown): value is DateFilterValue =>
    typeof value === 'string' ||
    typeof value === 'number' ||
    value instanceof Date;

export const getInvalidDateFilterValue = (
    values: unknown[] | undefined,
): string | undefined => {
    const invalidValue = values?.find(
        (value) =>
            value !== undefined &&
            value !== null &&
            value !== '' &&
            !parseFilterDateValue(value, TimeFrames.DAY),
    );

    return invalidValue === undefined ? undefined : String(invalidValue);
};

export const parseFilterDateValue = (
    value: unknown,
    timeFrame: TimeFrames,
): Date | null => {
    if (value === undefined || value === null || value === '') return null;
    if (!isDateFilterValue(value)) return null;
    if (!dayjs(value).isValid()) return null;

    const parsedValue = parseDate(formatDate(value, timeFrame), timeFrame);
    return dayjs(parsedValue).isValid() ? parsedValue : null;
};
