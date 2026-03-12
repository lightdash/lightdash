import { QueryHistoryStatus } from '@lightdash/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../api';
import { getResultsFromStream } from '../../utils/request';
import { executeSqlPivotQuery, executeSqlQuery } from './executeQuery';

vi.mock('../../api', () => ({
    lightdashApi: vi.fn(),
}));

vi.mock('../../utils/request', () => ({
    getResultsFromStream: vi.fn(),
}));

describe('executeQuery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('surfaces expired errors for SQL queries', async () => {
        vi.mocked(lightdashApi)
            .mockResolvedValueOnce({
                queryUuid: 'test-query-uuid',
            } as never)
            .mockResolvedValueOnce({
                status: QueryHistoryStatus.EXPIRED,
                queryUuid: 'test-query-uuid',
                error: 'Query expired in queue',
            } as never);

        await expect(
            executeSqlQuery('project-uuid', 'select 1'),
        ).rejects.toThrow('Query expired in queue');

        expect(getResultsFromStream).not.toHaveBeenCalled();
    });

    it('surfaces expired errors for pivot SQL queries', async () => {
        vi.mocked(lightdashApi)
            .mockResolvedValueOnce({
                queryUuid: 'test-query-uuid',
            } as never)
            .mockResolvedValueOnce({
                status: QueryHistoryStatus.EXPIRED,
                queryUuid: 'test-query-uuid',
                error: 'Query expired in queue',
            } as never);

        await expect(
            executeSqlPivotQuery('project-uuid', {
                sql: 'select 1',
                pivotConfiguration: {
                    indexColumn: undefined,
                    valuesColumns: [],
                    groupByColumns: undefined,
                    sortBy: undefined,
                },
            }),
        ).rejects.toThrow('Query expired in queue');

        expect(getResultsFromStream).not.toHaveBeenCalled();
    });
});
