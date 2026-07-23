import { formatDate, TimeFrames } from '@lightdash/common';
import {
    parseMantineDate,
    parseMantineDateRange,
    type MantineDateRange,
} from './mantineDateAdapter';

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
