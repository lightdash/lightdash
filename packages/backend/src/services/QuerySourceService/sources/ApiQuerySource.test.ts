import {
    FeatureFlags,
    ForbiddenError,
    ParameterError,
    QueryExecutionContext,
    QuerySourceType,
    type ApiSourceQuery,
} from '@lightdash/common';
import { buildAccount } from '../../../auth/account/account.mock';
import type { ApiConnector } from '../api/ApiConnector';
import type { SubmitSourceQueryArgs } from '../types';
import { ApiQuerySource } from './ApiQuerySource';

const account = buildAccount();
const projectUuid = '11111111-1111-4111-8111-111111111111';
const hogql =
    'SELECT toStartOfWeek(timestamp) AS week, count(DISTINCT person_id) AS wau FROM events GROUP BY week';

const connectionUuid = '22222222-2222-4222-8222-222222222222';
const connector: ApiConnector = {
    describe: vi.fn(),
    execute: vi.fn(),
};

const createSource = () => {
    const executeAsyncApiQuery = vi
        .fn()
        .mockResolvedValue({ queryUuid: 'api-query-uuid' });
    const getApiConnector = vi.fn().mockResolvedValue(connector);
    return {
        source: new ApiQuerySource({
            asyncQueryService: { executeAsyncApiQuery },
            getApiConnector,
        }),
        executeAsyncApiQuery,
        getApiConnector,
    };
};

const apiQuery: ApiSourceQuery = {
    sourceType: QuerySourceType.API,
    nodeId: 'weekly_active_users',
    connectionUuid,
    payload: { kind: 'query', query: hogql },
    limit: 100,
};

const submitArgs = (query: ApiSourceQuery): SubmitSourceQueryArgs => ({
    account,
    projectUuid,
    context: QueryExecutionContext.AI,
    query,
    resolvedReferences: {},
    parameters: {},
    userAttributeOverrides: {},
    invalidateCache: false,
    pivotConfiguration: null,
    plan: null,
});

describe('ApiQuerySource', () => {
    it('is gated by its own flag and refuses pivots', () => {
        const { source } = createSource();
        expect(source.requiredFeatureFlags).toEqual([
            FeatureFlags.ApiQuerySources,
        ]);
        expect(source.supportsPivot).toBe(false);
    });

    it('reads no other results', () => {
        const { source } = createSource();
        expect(source.getQueryReferences(apiQuery)).toEqual([]);
    });

    it('refuses other source types', () => {
        const { source } = createSource();
        expect(() =>
            source.getQueryReferences({
                sourceType: QuerySourceType.SQL,
                sql: 'SELECT 1',
            }),
        ).toThrow(ParameterError);
    });

    it('submits the payload to the connection connector', async () => {
        const { source, executeAsyncApiQuery, getApiConnector } =
            createSource();

        const result = await source.submitQuery(submitArgs(apiQuery));

        expect(getApiConnector).toHaveBeenCalledExactlyOnceWith(
            account,
            projectUuid,
            connectionUuid,
        );
        expect(result).toEqual({
            queryUuid: 'api-query-uuid',
            cacheHit: false,
        });
        expect(executeAsyncApiQuery).toHaveBeenCalledExactlyOnceWith({
            account,
            projectUuid,
            connectionUuid,
            connector,
            payload: { kind: 'query', query: hogql },
            limit: 100,
            parameters: {},
            invalidateCache: false,
            context: QueryExecutionContext.AI,
            querySurface: undefined,
        });
    });

    it('does not run when the connection is refused', async () => {
        const { source, executeAsyncApiQuery, getApiConnector } =
            createSource();
        getApiConnector.mockRejectedValue(new ForbiddenError());

        await expect(source.submitQuery(submitArgs(apiQuery))).rejects.toThrow(
            ForbiddenError,
        );
        expect(executeAsyncApiQuery).not.toHaveBeenCalled();
    });
});
