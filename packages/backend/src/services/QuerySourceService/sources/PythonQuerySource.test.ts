import {
    ParameterError,
    QueryExecutionContext,
    QuerySourceType,
    type PythonSourceQuery,
} from '@lightdash/common';
import { buildAccount } from '../../../auth/account/account.mock';
import type { SubmitSourceQueryArgs } from '../types';
import { PythonQuerySource } from './PythonQuerySource';

const account = buildAccount();
const projectUuid = '11111111-1111-4111-8111-111111111111';
const storedUuid = '33333333-3333-4333-8333-333333333333';
const code = 'def run(inputs, params):\n    return inputs["orders"]';

const createSource = () => {
    const executeAsyncPythonQuery = vi
        .fn()
        .mockResolvedValue({ queryUuid: 'python-query-uuid' });
    return {
        source: new PythonQuerySource({
            asyncQueryService: { executeAsyncPythonQuery },
        }),
        executeAsyncPythonQuery,
    };
};

const submitArgs = (
    query: PythonSourceQuery,
    resolvedReferences: Record<string, string>,
): SubmitSourceQueryArgs => ({
    account,
    projectUuid,
    context: QueryExecutionContext.AI,
    query,
    resolvedReferences,
    parameters: {},
    userAttributeOverrides: {},
    invalidateCache: false,
    pivotConfiguration: null,
    plan: null,
    sandboxLease: null,
});

describe('PythonQuerySource', () => {
    it('reads references from both the array and map forms', () => {
        const { source } = createSource();
        expect(
            source.getQueryReferences({
                sourceType: QuerySourceType.PYTHON,
                code,
                references: ['orders', 'payments'],
            }),
        ).toEqual(['orders', 'payments']);
        expect(
            source.getQueryReferences({
                sourceType: QuerySourceType.PYTHON,
                code,
                references: { o: 'orders', prev: storedUuid },
            }),
        ).toEqual(['orders', storedUuid]);
    });

    it('refuses other source types', () => {
        const { source } = createSource();
        expect(() =>
            source.getQueryReferences({
                sourceType: QuerySourceType.DUCKDB,
                sql: 'SELECT 1',
                references: ['orders'],
            }),
        ).toThrow(ParameterError);
    });

    it('submits the code with node references resolved to queryUuids', async () => {
        const { source, executeAsyncPythonQuery } = createSource();

        const result = await source.submitQuery({
            ...submitArgs(
                {
                    sourceType: QuerySourceType.PYTHON,
                    nodeId: 'forecast',
                    code,
                    limit: 100,
                    references: { orders: 'orders', prev: storedUuid },
                },
                { orders: 'orders-query-uuid' },
            ),
            parameters: { region: 'EMEA' },
            invalidateCache: true,
        });

        expect(result).toEqual({
            queryUuid: 'python-query-uuid',
            cacheHit: false,
        });
        expect(executeAsyncPythonQuery).toHaveBeenCalledExactlyOnceWith({
            account,
            projectUuid,
            code,
            limit: 100,
            references: { orders: 'orders-query-uuid', prev: storedUuid },
            parameters: { region: 'EMEA' },
            invalidateCache: true,
            context: QueryExecutionContext.AI,
            querySurface: undefined,
        });
    });
});
