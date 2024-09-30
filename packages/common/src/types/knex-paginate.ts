export type KnexPaginateArgs = {
    pageSize: number;
    page: number;
};

export type KnexPaginatedData<T> = {
    data: T;
    pagination?: KnexPaginateArgs & {
        totalPageCount: number;
    };
};
