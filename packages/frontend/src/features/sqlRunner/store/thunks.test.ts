import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeSqlQuery } from '../../queryRunner/executeQuery';
import { runSqlQuery } from './thunks';

vi.mock('../../queryRunner/executeQuery', () => ({
    executeSqlQuery: vi.fn(),
}));

describe('runSqlQuery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('always skips cache in SQL Runner edit mode', async () => {
        const mockResults = {
            queryUuid: 'query-uuid',
            fileUrl: '/api/v2/projects/project-uuid/query/query-uuid/results',
            results: {
                rows: [{ col1: 'value1' }],
                columns: { col1: { type: 'string' } },
            },
        };
        vi.mocked(executeSqlQuery).mockResolvedValueOnce(mockResults);

        const dispatch = vi.fn();
        const getState = vi.fn();

        const result = await runSqlQuery({
            sql: 'SELECT 1',
            limit: 100,
            projectUuid: 'project-uuid',
            parameterValues: { status: 'completed' },
        })(dispatch, getState, undefined);

        expect(executeSqlQuery).toHaveBeenCalledWith(
            'project-uuid',
            'SELECT 1',
            100,
            { status: 'completed' },
            true,
        );
        expect(result.payload).toEqual(mockResults);
    });
});
