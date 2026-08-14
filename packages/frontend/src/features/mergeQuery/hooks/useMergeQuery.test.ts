import {
    ChartType,
    DimensionType,
    FieldType,
    MergeJoinType,
    MetricType,
} from '@lightdash/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../api';
import { executeMergeQuery } from './useMergeQuery';

vi.mock('../../../api', () => ({ lightdashApi: vi.fn() }));

const api = vi.mocked(lightdashApi);

describe('executeMergeQuery', () => {
    beforeEach(() => api.mockReset());

    it('runs a merged table with its pivot configuration', async () => {
        api.mockResolvedValueOnce({
            sql: 'select 1',
            coreSql: 'select 1',
            typedColumns: [],
            terminalWrapper: {},
            columns: {},
            fields: [],
            itemsMap: {
                merge_join_key_0: {
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.STRING,
                    name: 'join_key_0',
                    label: 'Customer',
                    table: 'merge',
                    tableLabel: 'Merged',
                    sql: '',
                    hidden: false,
                },
                a_orders_count: {
                    fieldType: FieldType.METRIC,
                    type: MetricType.COUNT,
                    name: 'orders_count',
                    label: 'Orders',
                    table: 'a',
                    tableLabel: 'Orders',
                    sql: '',
                    hidden: false,
                },
            },
            fieldOrigins: {},
            parameterReferences: ['date_dim_parameter'],
            fieldIdByColumn: {
                join_key_0: 'merge_join_key_0',
                orders_count: 'a_orders_count',
            },
            errors: [],
        } as never);
        api.mockResolvedValueOnce({ queryUuid: 'query-uuid' } as never);

        const result = await executeMergeQuery(
            'project-uuid',
            {
                sources: [],
                joinKey: [],
                joinType: MergeJoinType.FULL,
                limit: 500,
                tableCalculations: [],
            },
            {},
            {
                chartConfig: {
                    type: ChartType.TABLE,
                    config: {},
                },
                pivotConfig: {
                    columns: ['merge_join_key_0'],
                    rows: [],
                },
            },
            42,
        );

        expect(
            JSON.parse((api.mock.calls[1][0].body as string) ?? '{}'),
        ).toMatchObject({
            pivotConfiguration: {
                groupByColumns: [{ reference: 'merge_join_key_0' }],
                valuesColumns: [
                    { reference: 'a_orders_count', aggregation: 'any' },
                ],
            },
            csvLimit: 42,
        });
        expect(result.parameterReferences).toEqual(['date_dim_parameter']);
        expect(api).toHaveBeenCalledTimes(2);
    });

    it('returns parameter references when compilation is refused', async () => {
        api.mockResolvedValueOnce({
            sql: null,
            parameterReferences: ['customers.customer_name'],
            errors: [{ message: 'Missing customer name' }],
        } as never);

        const result = await executeMergeQuery('project-uuid', {
            sources: [],
            joinKey: [],
            joinType: MergeJoinType.FULL,
            limit: 500,
            tableCalculations: [],
        });

        expect(result).toMatchObject({
            started: null,
            parameterReferences: ['customers.customer_name'],
        });
        expect(api).toHaveBeenCalledTimes(1);
    });
});
