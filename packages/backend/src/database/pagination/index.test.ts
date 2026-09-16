import knex, { type Knex } from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import KnexPaginate, { type KnexPaginateQueryMeasurer } from '.';

describe('KnexPaginate page executor', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
        vi.restoreAllMocks();
    });

    it('uses the override for the page and keeps count measurement on the base query', async () => {
        tracker.on
            .any(({ sql }) => sql.includes('WITH count_cte AS'))
            .response({ rows: [{ count: '3' }] });
        const executePageQuery = vi.fn(async () => [{ id: 2 }]);
        const queryTypes: string[] = [];
        const measureQuery: KnexPaginateQueryMeasurer = async (
            execute,
            queryType,
        ) => {
            queryTypes.push(queryType);
            return execute();
        };

        const result = await KnexPaginate.paginate<
            { id: number },
            Array<{ id: number }>
        >(
            (database as Knex)<{ id: number }>('items').select('id'),
            { page: 2, pageSize: 1 },
            undefined,
            measureQuery,
            executePageQuery,
        );

        expect(result).toEqual({
            data: [{ id: 2 }],
            pagination: {
                page: 2,
                pageSize: 1,
                totalPageCount: 3,
                totalResults: 3,
            },
        });
        expect(executePageQuery).toHaveBeenCalledOnce();
        expect(queryTypes).toEqual(expect.arrayContaining(['count', 'page']));
        expect(tracker.history.all).toHaveLength(1);
    });

    it('uses the override without running a count for unpaginated reads', async () => {
        const executePageQuery = vi.fn(async () => [{ id: 1 }, { id: 2 }]);

        const result = await KnexPaginate.paginate<
            { id: number },
            Array<{ id: number }>
        >(
            (database as Knex)<{ id: number }>('items').select('id'),
            undefined,
            undefined,
            undefined,
            executePageQuery,
        );

        expect(result).toEqual({ data: [{ id: 1 }, { id: 2 }] });
        expect(executePageQuery).toHaveBeenCalledOnce();
        expect(tracker.history.all).toHaveLength(0);
    });
});
