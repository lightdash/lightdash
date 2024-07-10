import { IKnexPaginateArgs, IKnexPaginatedData } from '@lightdash/common';
import { Knex } from 'knex';
import { KnexPaginationError } from './errors';

export default class KnexPaginate {
    static async paginate<T extends Knex.QueryBuilder>(
        query: T,
        paginateArgs?: IKnexPaginateArgs,
    ): Promise<IKnexPaginatedData<typeof query>> {
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
            const count = await query.clone().clear('select').count();
            const data = await query.clone().offset(offset).limit(pageSize);

            return {
                data,
                pagination: {
                    page,
                    pageSize,
                    totalPageCount: Math.ceil(count.length / pageSize),
                },
            };
        }

        const data = await query;

        return {
            data,
        };
    }
}
