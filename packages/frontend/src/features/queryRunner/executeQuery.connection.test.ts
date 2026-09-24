import {
    FieldType,
    QueryExecutionContext,
    QueryHistoryStatus,
    SqlRunnerFieldType,
    VizAggregationOptions,
} from '@lightdash/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../api';
import { getResultsFromStream } from '../../utils/request';
import { executeSqlQuery } from './executeQuery';
import { getPivotQueryFunctionForSqlQuery } from './sqlRunnerPivotQueries';

vi.mock('../../api', () => ({
    lightdashApi: vi.fn(),
}));

vi.mock('../../utils/request', () => ({
    getResultsFromStream: vi.fn(),
}));

const serveReadyQuery = () => {
    vi.mocked(lightdashApi)
        .mockResolvedValueOnce({ queryUuid: 'query-uuid' } as never)
        .mockResolvedValueOnce({
            status: QueryHistoryStatus.READY,
            queryUuid: 'query-uuid',
            columns: { amount: { type: 'number' } },
        } as never);
    vi.mocked(getResultsFromStream).mockResolvedValueOnce([] as never);
};

const postedBody = () =>
    JSON.parse(vi.mocked(lightdashApi).mock.calls[0][0].body as string);

describe('SQL runner request bodies and the active connection', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('sends the exact main body when no connection is given', async () => {
        serveReadyQuery();

        await executeSqlQuery('project-uuid', 'select 1', 10, {}, true);

        expect(vi.mocked(lightdashApi).mock.calls[0][0].body).toBe(
            JSON.stringify({
                sql: 'select 1',
                limit: 10,
                parameters: {},
                invalidateCache: true,
            }),
        );
    });

    it.each([
        { name: 'an extra connection', connection: 'finance-uuid' },
        { name: 'the original (null)', connection: null },
    ])('sends $name as warehouseConnectionUuid', async ({ connection }) => {
        serveReadyQuery();

        await executeSqlQuery(
            'project-uuid',
            'select 1',
            10,
            {},
            true,
            connection,
        );

        expect(postedBody()).toEqual({
            sql: 'select 1',
            limit: 10,
            parameters: {},
            invalidateCache: true,
            warehouseConnectionUuid: connection,
        });
    });

    const pivotQuery = (warehouseConnectionUuid?: string | null) =>
        getPivotQueryFunctionForSqlQuery({
            projectUuid: 'project-uuid',
            sql: 'select 1',
            limit: 10,
            fields: [
                {
                    kind: FieldType.DIMENSION,
                    name: 'amount',
                    type: SqlRunnerFieldType.NUMBER,
                    visible: true,
                    label: 'amount',
                    availableGranularities: [],
                    availableOperators: [],
                },
            ],
            context: QueryExecutionContext.SQL_RUNNER,
            parameters: {},
            ...(warehouseConnectionUuid === undefined
                ? {}
                : { warehouseConnectionUuid }),
        })({
            pivot: { index: [], on: [], values: ['amount_sum'] },
            customMetrics: [
                {
                    name: 'amount_sum',
                    baseDimension: 'amount',
                    aggType: VizAggregationOptions.SUM,
                },
            ],
        } as never);

    it('sends no connection field in a pivot query without a connection', async () => {
        serveReadyQuery();

        await pivotQuery();

        expect(postedBody()).not.toHaveProperty('warehouseConnectionUuid');
    });

    it('sends the active connection in a pivot query', async () => {
        serveReadyQuery();

        await pivotQuery('finance-uuid');

        expect(postedBody()).toMatchObject({
            warehouseConnectionUuid: 'finance-uuid',
        });
    });
});
