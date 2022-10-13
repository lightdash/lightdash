export type ResultRow = {
    [col: string]: {
        value: {
            raw: any;
            formatted: any;
        };
    };
};
