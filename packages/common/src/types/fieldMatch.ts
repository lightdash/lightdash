export type FieldValueSearchResult<T = unknown> = {
    search: string;
    results: T[];
    cached: boolean;
    refreshedAt: Date;
};
