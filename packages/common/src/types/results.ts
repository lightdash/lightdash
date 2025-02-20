export type ResultValue = {
    raw: unknown;
    formatted: string | null; // null if the value is not formatted
};

export type ResultRow = Record<string, { value: ResultValue }>;

export type RawResultRow = Record<string, unknown>;
