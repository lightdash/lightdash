import { ChartType, MergeJoinType } from '@lightdash/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../api';
import { executeMergeQuery } from './useMergeQuery';

vi.mock('../../../api', () => ({ lightdashApi: vi.fn() }));

const api = vi.mocked(lightdashApi);

describe('executeMergeQuery', () => {
    beforeEach(() => api.mockReset());

    it('starts a merge with one v2 request', async () => {
        api.mockResolvedValueOnce({
            errors: [],
            started: { queryUuid: 'query-uuid' },
            fieldOrigins: {},
            parameterReferences: ['date_dim_parameter'],
        } as never);

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

        expect(api).toHaveBeenCalledWith(
            expect.objectContaining({
                url: '/projects/project-uuid/query/merge-query',
                version: 'v2',
            }),
        );
        expect(
            JSON.parse((api.mock.calls[0][0].body as string) ?? '{}'),
        ).toMatchObject({
            chartConfig: {
                type: ChartType.TABLE,
                config: {},
            },
            pivotConfig: {
                columns: ['merge_join_key_0'],
                rows: [],
            },
            csvLimit: 42,
        });
        expect(result.parameterReferences).toEqual(['date_dim_parameter']);
        expect(api).toHaveBeenCalledTimes(1);
    });

    it('returns parameter references when compilation is refused', async () => {
        api.mockResolvedValueOnce({
            started: null,
            fieldOrigins: {},
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
