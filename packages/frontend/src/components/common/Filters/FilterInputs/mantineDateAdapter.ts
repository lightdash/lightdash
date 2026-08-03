const padTwoDigits = (value: number): string => String(value).padStart(2, '0');
const MANTINE_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MANTINE_DATE_TIME_PATTERN =
    /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;

export type MantineDateRange = [string | null, string | null];
export type LightdashDateRange = [Date | null, Date | null];

export const formatMantineDate = (value: Date | null): string | null => {
    if (value === null || Number.isNaN(value.getTime())) return null;

    return [
        String(value.getFullYear()).padStart(4, '0'),
        padTwoDigits(value.getMonth() + 1),
        padTwoDigits(value.getDate()),
    ].join('-');
};

export const formatMantineDateTime = (value: Date | null): string | null => {
    const date = formatMantineDate(value);
    if (date === null || value === null) return null;

    const time = [
        padTwoDigits(value.getHours()),
        padTwoDigits(value.getMinutes()),
        padTwoDigits(value.getSeconds()),
    ].join(':');

    return `${date} ${time}`;
};

export const parseMantineDate = (value: string | null): Date | null => {
    if (value === null) return null;

    const match = MANTINE_DATE_PATTERN.exec(value);
    if (match === null) return null;

    const [, yearSource, monthSource, daySource] = match;
    const year = Number(yearSource);
    const monthIndex = Number(monthSource) - 1;
    const day = Number(daySource);
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

export const parseMantineDateTime = (value: string | null): Date | null => {
    if (value === null) return null;

    const match = MANTINE_DATE_TIME_PATTERN.exec(value);
    if (match === null) return null;

    const [
        ,
        yearSource,
        monthSource,
        daySource,
        hourSource,
        minuteSource,
        secondSource,
    ] = match;
    const year = Number(yearSource);
    const monthIndex = Number(monthSource) - 1;
    const day = Number(daySource);
    const hour = Number(hourSource);
    const minute = Number(minuteSource);
    const second = Number(secondSource);
    const parsed = new Date(year, monthIndex, day, hour, minute, second);

    if (
        parsed.getFullYear() !== year ||
        parsed.getMonth() !== monthIndex ||
        parsed.getDate() !== day ||
        parsed.getHours() !== hour ||
        parsed.getMinutes() !== minute ||
        parsed.getSeconds() !== second
    ) {
        return null;
    }

    return parsed;
};

export const formatMantineDateRange = (
    value: LightdashDateRange,
): MantineDateRange => [
    formatMantineDate(value[0]),
    formatMantineDate(value[1]),
];

export const parseMantineDateRange = (
    value: MantineDateRange,
): LightdashDateRange => [
    parseMantineDate(value[0]),
    parseMantineDate(value[1]),
];
