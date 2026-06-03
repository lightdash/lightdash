export type FilterParserOptions = {
    operators: {
        equals: string;
        include: string;
        startsWith: string;
        endsWith: string;
        inBetween: string;
        inThePast: string;
        inTheNext: string;
    };
};

export type ParsedFilter = {
    type: string;
    values?: unknown[];
    is?: boolean;
    date_interval?: string;
};
