import {
    KnexPaginateArgs,
    KnexPaginatedData,
    KnexPaginationError,
} from '@lightdash/common';
import { Knex } from 'knex';

export type KnexQueryBuilderResult<T> = T extends Knex.QueryBuilder<
    infer _,
    infer TResult
>
    ? TResult
    : never;

export default class KnexPaginate {
    static async paginate<T extends Knex.QueryBuilder>(
        query: T,
        paginateArgs?: KnexPaginateArgs,
    ): Promise<KnexPaginatedData<KnexQueryBuilderResult<T>>> {
        if (paginateArgs) {
            const { page, pageSize } = paginateArgs;
            if (page < 1) {
                throw new KnexPaginationError('page should be greater than 0');
            }

            if (pageSize < 1) {
                throw new KnexPaginationError(
                    'pageSize should be greater than 0',
                );
            }

            const offset = (page - 1) * pageSize;
            const totalRecordsCountPromise = query
                .clone()
                .clear('select')
                .count();
            const dataPromise = query.clone().offset(offset).limit(pageSize);
            const [count, data] = await Promise.all([
                totalRecordsCountPromise,
                dataPromise,
            ]);

            return {
                data,
                pagination: {
                    page,
                    pageSize,
                    totalPageCount: Math.ceil(count.length / pageSize),
                },
            };
        }

        const data = (await query) as KnexQueryBuilderResult<T>;

        return {
            data,
        };
    }
}
