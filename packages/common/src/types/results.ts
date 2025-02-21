export type ResultValue = {
    raw: unknown;
    formatted: string | null; // null if the value is not formatted
};

export const getFormattedWithFallback = (
    value: ResultValue | undefined,
): string => value?.formatted || `${value?.raw}`;

export type ResultRow = Record<string, { value: ResultValue }>;

export type RawResultRow = Record<string, unknown>;
