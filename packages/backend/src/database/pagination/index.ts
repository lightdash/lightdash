import {
    KnexPaginateArgs,
    KnexPaginatedData,
    KnexPaginationError,
} from '@lightdash/common';
import { Knex } from 'knex';

export default class KnexPaginate {
    static async paginate<TRecord extends {}, TResult>(
        query: Knex.QueryBuilder<TRecord, TResult>,
        paginateArgs?: KnexPaginateArgs,
    ): Promise<KnexPaginatedData<TResult>> {
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
                .count<{ count: string }[]>();
            const dataPromise = query.clone().offset(offset).limit(pageSize);
            const [count, data] = await Promise.all([
                totalRecordsCountPromise,
                dataPromise,
            ]);

            return {
                data: data as TResult,
                pagination: {
                    page,
                    pageSize,
                    totalPageCount: Math.ceil(count.length / pageSize),
                },
            };
        }

        return {
            data: (await query) as TResult,
        };
    }
}
