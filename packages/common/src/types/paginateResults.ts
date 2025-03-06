import type { KnexPaginateArgs, KnexPaginatedData } from './knex-paginate';

export const DEFAULT_RESULTS_PAGE_SIZE = 500;

export type ResultsPaginationArgs = Partial<KnexPaginateArgs>;

export type ResultsPaginationMetadata<T> = KnexPaginatedData<
    T[]
>['pagination'] & {
    nextPage: number | undefined;
    previousPage: number | undefined;
};
