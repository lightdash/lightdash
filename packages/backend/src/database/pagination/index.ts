import {
    KnexPaginateArgs,
    KnexPaginatedData,
    PaginationError,
} from '@lightdash/common';
import { Knex } from 'knex';

export default class KnexPaginate {
    /**
     * `countQuery`, when provided, is used for the total count instead of the
     * data query. It must return the same number of rows — use it when the
     * data query carries expensive computed columns (e.g. window functions)
     * that don't affect the row count.
     */
    static async paginate<TRecord extends {}, TResult>(
        query: Knex.QueryBuilder<TRecord, TResult>,
        paginateArgs?: KnexPaginateArgs,
        countQuery?: Knex.QueryBuilder,
    ): Promise<KnexPaginatedData<TResult>> {
        if (paginateArgs) {
            const { page, pageSize } = paginateArgs;
            if (page < 1) {
                throw new PaginationError('page should be greater than 0');
            }

            if (pageSize < 1) {
                throw new PaginationError('pageSize should be greater than 0');
            }

            const offset = (page - 1) * pageSize;
            const totalRecordsCountPromise = query.client.raw(
                `
                WITH count_cte AS (?)
                SELECT count(*) as count FROM count_cte
            `,
                [(countQuery ?? query).clone().clear('limit').clear('offset')],
            );
            const dataPromise = query.clone().offset(offset).limit(pageSize);
            const [countData, data] = await Promise.all([
                totalRecordsCountPromise,
                dataPromise,
            ]);

            const count = Number(countData?.rows?.[0]?.count) || 0;

            return {
                data: data as TResult,
                pagination: {
                    page,
                    pageSize,
                    totalPageCount: Math.ceil(count / pageSize),
                    totalResults: count,
                },
            };
        }

        return {
            data: (await query) as TResult,
        };
    }
}
