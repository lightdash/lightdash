import {
    ParameterError,
    QueryExecutionContext,
    QuerySourceType,
    type FunnelSourceQuery,
    type SourceQuery,
} from '@lightdash/common';
import { buildAccount } from '../../../auth/account/account.mock';
import {
    eventsExplore,
    funnelDefinition,
} from '../../FunnelService/funnelSql.mock';
import type { SubmitSourceQueryArgs } from '../types';
import { FunnelQuerySource } from './FunnelQuerySource';

const account = buildAccount();
const projectUuid = '11111111-1111-4111-8111-111111111111';
const extraConnectionUuid = '22222222-2222-4222-8222-222222222222';

const funnelQuery: FunnelSourceQuery = {
    sourceType: QuerySourceType.FUNNEL,
    exploreName: 'events',
    ...funnelDefinition,
    limit: 100,
};

const createSource = () => {
    const executeAsyncSqlQuery = vi.fn().mockResolvedValue({
        queryUuid: 'funnel-query-uuid',
        cacheMetadata: { cacheHit: false },
    });
    const resolveWarehouseCredentialRead = vi
        .fn()
        .mockResolvedValue({ kind: 'original' });
    const source = new FunnelQuerySource({
        asyncQueryService: { executeAsyncSqlQuery },
        projectService: {
            getAllExploresSummary: vi.fn(),
            findExplores: vi.fn(),
            getWarehouseSqlBuilderSettings: vi
                .fn()
                .mockResolvedValue({ type: 'postgres' }),
        },
        projectModel: {
            getExploreFromCache: vi.fn().mockResolvedValue(eventsExplore),
            resolveWarehouseCredentialRead,
        },
    });
    return { source, executeAsyncSqlQuery, resolveWarehouseCredentialRead };
};

const submitArgs = (query: SourceQuery): SubmitSourceQueryArgs => ({
    account,
    projectUuid,
    context: QueryExecutionContext.MULTI_SOURCE_QUERY,
    query,
    resolvedReferences: {},
    parameters: {},
    userAttributeOverrides: {},
    invalidateCache: false,
    pivotConfiguration: null,
    plan: null,
});

describe('FunnelQuerySource', () => {
    it('compiles the funnel and runs it through the SQL runner path', async () => {
        const { source, executeAsyncSqlQuery } = createSource();

        const result = await source.submitQuery(submitArgs(funnelQuery));

        expect(result).toEqual({
            queryUuid: 'funnel-query-uuid',
            cacheHit: false,
        });
        expect(executeAsyncSqlQuery).toHaveBeenCalledTimes(1);
        const [call] = executeAsyncSqlQuery.mock.calls[0];
        expect(call).toMatchObject({
            account,
            projectUuid,
            limit: 100,
            context: QueryExecutionContext.MULTI_SOURCE_QUERY,
            warehouseConnectionUuid: null,
        });
        expect(call.sql).toContain(`'signup' AS "step_name"`);
        expect(call.sql).toContain(`'invite' AS "step_name"`);
        expect(call.sql).toContain('FROM "public"."events"');
    });

    it("runs on the explore's connection in a multi-connection project", async () => {
        const { source, executeAsyncSqlQuery, resolveWarehouseCredentialRead } =
            createSource();
        resolveWarehouseCredentialRead.mockResolvedValue({
            kind: 'extra',
            warehouseConnectionUuid: extraConnectionUuid,
        });

        await source.submitQuery(submitArgs(funnelQuery));

        expect(resolveWarehouseCredentialRead).toHaveBeenCalledWith(
            projectUuid,
            { kind: 'explore', exploreName: 'events' },
        );
        expect(executeAsyncSqlQuery.mock.calls[0][0]).toMatchObject({
            warehouseConnectionUuid: extraConnectionUuid,
        });
    });

    it('refuses other source types', async () => {
        const { source, executeAsyncSqlQuery } = createSource();

        await expect(
            source.submitQuery(
                submitArgs({
                    sourceType: QuerySourceType.SQL,
                    sql: 'SELECT 1',
                }),
            ),
        ).rejects.toThrow(ParameterError);
        expect(executeAsyncSqlQuery).not.toHaveBeenCalled();
    });

    it('refuses a funnel with fewer than two steps', async () => {
        const { source, executeAsyncSqlQuery } = createSource();

        await expect(
            source.submitQuery(
                submitArgs({
                    ...funnelQuery,
                    steps: [{ stepOrder: 1, eventName: 'signup' }],
                }),
            ),
        ).rejects.toThrow('A funnel needs at least two steps');
        expect(executeAsyncSqlQuery).not.toHaveBeenCalled();
    });

    it('references no other queries', () => {
        const { source } = createSource();

        expect(source.getQueryReferences()).toEqual([]);
    });
});
