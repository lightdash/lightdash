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

    it('passes invalidateCache parameter to API when true', async () => {
        vi.mocked(lightdashApi)
            .mockResolvedValueOnce({
                queryUuid: 'test-query-uuid',
            } as never)
            .mockResolvedValueOnce({
                status: QueryHistoryStatus.READY,
                queryUuid: 'test-query-uuid',
                columns: { col1: { type: 'string' } },
            } as never);

        vi.mocked(getResultsFromStream).mockResolvedValueOnce({
            rows: [{ col1: 'value1' }],
            columns: { col1: { type: 'string' } },
        } as never);

        await executeSqlQuery(
            'project-uuid',
            'select 1',
            100,
            {},
            true, // invalidateCache
        );

        // Verify the first API call (POST /sql) includes invalidateCache in body
        expect(lightdashApi).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'POST',
                url: '/projects/project-uuid/query/sql',
                version: 'v2',
                body: expect.stringContaining('"invalidateCache":true'),
            }),
        );
    });

    it('passes invalidateCache parameter to API when false', async () => {
        vi.mocked(lightdashApi)
            .mockResolvedValueOnce({
                queryUuid: 'test-query-uuid',
            } as never)
            .mockResolvedValueOnce({
                status: QueryHistoryStatus.READY,
                queryUuid: 'test-query-uuid',
                columns: { col1: { type: 'string' } },
            } as never);

        vi.mocked(getResultsFromStream).mockResolvedValueOnce({
            rows: [{ col1: 'value1' }],
            columns: { col1: { type: 'string' } },
        } as never);

        await executeSqlQuery(
            'project-uuid',
            'select 1',
            100,
            {},
            false, // invalidateCache
        );

        // Verify the first API call (POST /sql) includes invalidateCache in body
        expect(lightdashApi).toHaveBeenCalledWith(
            expect.objectContaining({
                method: 'POST',
                url: '/projects/project-uuid/query/sql',
                version: 'v2',
                body: expect.stringContaining('"invalidateCache":false'),
            }),
        );
    });

    it('omits invalidateCache from body when not provided', async () => {
        vi.mocked(lightdashApi)
            .mockResolvedValueOnce({
                queryUuid: 'test-query-uuid',
            } as never)
            .mockResolvedValueOnce({
                status: QueryHistoryStatus.READY,
                queryUuid: 'test-query-uuid',
                columns: { col1: { type: 'string' } },
            } as never);

        vi.mocked(getResultsFromStream).mockResolvedValueOnce({
            rows: [{ col1: 'value1' }],
            columns: { col1: { type: 'string' } },
        } as never);

        await executeSqlQuery('project-uuid', 'select 1', 100, {});

        // Verify the first API call (POST /sql) - invalidateCache should be undefined and not included in JSON
        const firstCall = vi.mocked(lightdashApi).mock.calls[0][0];
        expect(firstCall.method).toBe('POST');
        expect(firstCall.url).toBe('/projects/project-uuid/query/sql');
        expect(firstCall.version).toBe('v2');
        // When invalidateCache is undefined, JSON.stringify omits it from the body
        expect(firstCall.body).not.toContain('invalidateCache');
    });
});
