export type ResultValue = {
    raw: unknown;
    formatted: string;
};

export type ResultRow = {
    [col: string]: {
        value: ResultValue;
    };
};
