export type ResultValue = {
    raw: unknown;
    formatted: string;
};

export type ResultRow = Record<string, { value: ResultValue }>;

export type RawResultRow = Record<string, unknown>;
