export type ResultValue = {
    raw: unknown;
    formatted: string;
};

export type ResultRow = Record<string, { value: ResultValue }>;

export type RawResultRow = Record<string, unknown>;

export const isFormattedResult = (
    result: unknown | { value: ResultValue },
): result is ResultValue =>
    !!(result && typeof result === 'object' && 'formatted' in result);

export const isRawResultRow = (
    row: ResultRow | RawResultRow,
): row is RawResultRow =>
    !Object.values(row).some(
        (value) => value && typeof value === 'object' && 'value' in value,
    );
