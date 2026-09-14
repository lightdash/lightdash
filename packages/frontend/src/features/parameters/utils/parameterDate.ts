import { formatDate, TimeFrames } from '@lightdash/common';

// Parameter dates persist as YYYY-MM-DD strings (legacy values may carry a
// time suffix, which is ignored); this policy is owned here, not by the pickers
const PARAMETER_DATE_PATTERN =
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

export const parseParameterDateValue = (value: string | null): Date | null => {
    if (value === null) return null;

    const match = PARAMETER_DATE_PATTERN.exec(value);
    if (match === null) return null;

    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    const day = Number(match[3]);
    const parsed = new Date(year, monthIndex, day);

    if (
        parsed.getFullYear() !== year ||
        parsed.getMonth() !== monthIndex ||
        parsed.getDate() !== day
    ) {
        return null;
    }

    return parsed;
};

export const serializeParameterDateValue = (date: Date | null): string | null =>
    date ? formatDate(date, TimeFrames.DAY) : null;
