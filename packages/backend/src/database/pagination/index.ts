import {
    KnexPaginateArgs,
    KnexPaginatedData,
    PaginationError,
} from '@lightdash/common';
import { Knex } from 'knex';

export type KnexPaginateQueryType = 'count' | 'page';

export type KnexPaginateQueryMeasurer = <T>(
    query: () => PromiseLike<T>,
    queryType: KnexPaginateQueryType,
) => Promise<T>;

export type KnexPaginatePageExecutor<TResult> = () => PromiseLike<TResult>;

type KnexPaginateCountResult = {
    rows?: Array<{ count?: unknown }>;
};

export default class KnexPaginate {
    /**
     * `countQuery`, when provided, is used for the total count instead of the
     * data query. It must return the same number of rows — use it when the
     * data query carries expensive computed columns (e.g. window functions)
     * that don't affect the row count.
     */
    static async paginate<TRecord extends {}, TResult, TPageResult = TResult>(
        query: Knex.QueryBuilder<TRecord, TResult>,
        paginateArgs?: KnexPaginateArgs,
        countQuery?: Knex.QueryBuilder,
        measureQuery?: KnexPaginateQueryMeasurer,
        executePageQuery?: KnexPaginatePageExecutor<TPageResult>,
    ): Promise<KnexPaginatedData<TPageResult>> {
        const runQuery = <T>(
            execute: () => PromiseLike<T>,
            queryType: KnexPaginateQueryType,
        ): PromiseLike<T> =>
            measureQuery ? measureQuery(execute, queryType) : execute();

        if (paginateArgs) {
            const { page, pageSize } = paginateArgs;
            if (page < 1) {
                throw new PaginationError('page should be greater than 0');
            }

            if (pageSize < 1) {
                throw new PaginationError('pageSize should be greater than 0');
            }

            const offset = (page - 1) * pageSize;
            const totalRecordsCountPromise = runQuery<KnexPaginateCountResult>(
                () =>
                    query.client.raw(
                        `
                        WITH count_cte AS (?)
                        SELECT count(*) as count FROM count_cte
                    `,
                        [
                            (countQuery ?? query)
                                .clone()
                                .clear('limit')
                                .clear('offset'),
                        ],
                    ) as unknown as PromiseLike<KnexPaginateCountResult>,
                'count',
            );
            const dataPromise = runQuery<TPageResult>(
                () =>
                    executePageQuery
                        ? executePageQuery()
                        : (query
                              .clone()
                              .offset(offset)
                              .limit(
                                  pageSize,
                              ) as unknown as PromiseLike<TPageResult>),
                'page',
            );
            const [countData, data] = await Promise.all([
                totalRecordsCountPromise,
                dataPromise,
            ]);

            const count = Number(countData?.rows?.[0]?.count) || 0;

            return {
                data,
                pagination: {
                    page,
                    pageSize,
                    totalPageCount: Math.ceil(count / pageSize),
                    totalResults: count,
                },
            };
        }

        return {
            data: await runQuery<TPageResult>(
                () =>
                    executePageQuery
                        ? executePageQuery()
                        : (query as unknown as PromiseLike<TPageResult>),
                'page',
            ),
        };
    }
}
