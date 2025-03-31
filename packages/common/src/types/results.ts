export type ResultValue = {
    raw: unknown;
    formatted: string;
};

export const isResultValue = (
    value: unknown,
): value is { value: ResultValue } =>
    typeof value === 'object' &&
    value !== null &&
    'value' in value &&
    typeof value.value === 'object' &&
    value.value !== null &&
    'raw' in value.value &&
    'formatted' in value.value;

export type ResultRow = Record<string, { value: ResultValue }>;

type RawResultValue = unknown;

export type RawResultRow = Record<string, RawResultValue>;

export const isRawResultRow = (value: unknown): value is RawResultValue =>
    typeof value !== 'object' || value === null;
