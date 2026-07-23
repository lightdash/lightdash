import { formatDate, TimeFrames } from '@lightdash/common';
import {
    parseMantineDate,
    parseMantineDateRange,
    type MantineDateRange,
} from './mantineDateAdapter';

const PARAMETER_DATE_PATTERN =
    /^(\d{4}-\d{2}-\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

export const parseParameterDateValue = (value: string | null): Date | null => {
    if (value === null) return null;

    const match = PARAMETER_DATE_PATTERN.exec(value);
    return match ? parseMantineDate(match[1]) : null;
};

export const serializeMantineDateRangeToIso = (
    range: MantineDateRange,
): [string | null, string | null] => {
    const parsedRange = parseMantineDateRange(range);
    return [
        parsedRange[0]?.toISOString() ?? null,
        parsedRange[1]?.toISOString() ?? null,
    ];
};

export const serializeParameterDateValue = (
    mantineValue: string | null,
): string | null => {
    const date = parseMantineDate(mantineValue);
    return date ? formatDate(date, TimeFrames.DAY) : null;
};
