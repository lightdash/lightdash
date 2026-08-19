import { QueryExecutionContext, type Account } from '@lightdash/common';
import { JsonRpcErrorCodes, TdcpDialects, TdcpMethods } from '@lightdash/tdcp';
import type { AsyncQueryService } from '../../../AsyncQueryService/AsyncQueryService';
import { createDuckdbComposeTdcpServer } from './DuckdbComposeTdcpServer';

const account = {} as Account;
const expiresAt = new Date('2026-08-19T00:00:00.000Z');
const queryUuid = '1efef180-3b4d-4f1d-a72f-fd99c0f2d884';

const createServer = () => {
    const executeAsyncComposeSqlQuery = vi
        .fn()
        .mockResolvedValue({ queryUuid });
    const getCacheExpiresAt = vi.fn().mockReturnValue(expiresAt);
    const asyncQueryService = {
        executeAsyncComposeSqlQuery,
        getCacheExpiresAt,
    } as unknown as AsyncQueryService;

    return {
        server: createDuckdbComposeTdcpServer({ asyncQueryService }),
        executeAsyncComposeSqlQuery,
    };
};

const context = {
    account,
    projectUuid: 'project-uuid',
    queryContext: QueryExecutionContext.MULTI_SOURCE_QUERY,
};

describe('DuckDB compose TDCP server', () => {
    it('derives its production capabilities through the SDK', async () => {
        const { server } = createServer();

        await expect(server.capabilities(context)).resolves.toMatchObject({
            queryDialects: [TdcpDialects.DUCKDB_SQL],
            compose: true,
        });
    });

    it('runs valid requests through the production compose backend', async () => {
        const { server, executeAsyncComposeSqlQuery } = createServer();

        await expect(
            server.execute(context, {
                method: TdcpMethods.QUERY,
                dialect: TdcpDialects.DUCKDB_SQL,
                query: 'SELECT * FROM orders',
                references: { orders: 'upstream-query-uuid' },
                limit: 100,
            }),
        ).resolves.toMatchObject({ datasetId: queryUuid, links: null });
        expect(executeAsyncComposeSqlQuery).toHaveBeenCalledWith({
            account,
            projectUuid: context.projectUuid,
            sql: 'SELECT * FROM orders',
            references: { orders: 'upstream-query-uuid' },
            limit: 100,
            context: context.queryContext,
        });
    });

    it('rejects undeclared dialects before calling the backend', async () => {
        const { server, executeAsyncComposeSqlQuery } = createServer();

        await expect(
            server.execute(context, {
                method: TdcpMethods.QUERY,
                dialect: TdcpDialects.POSTGRES_SQL,
                query: 'SELECT 1',
            }),
        ).rejects.toMatchObject({
            code: JsonRpcErrorCodes.CAPABILITY_NOT_SUPPORTED,
        });
        expect(executeAsyncComposeSqlQuery).not.toHaveBeenCalled();
    });
});
