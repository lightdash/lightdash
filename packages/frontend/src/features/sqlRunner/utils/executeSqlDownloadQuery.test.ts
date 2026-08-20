import { MAX_SAFE_INTEGER } from '@lightdash/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeSqlQuery } from '../../queryRunner/executeQuery';
import { type ResultsAndColumns } from '../hooks/useSqlQueryRun';
import { executeSqlDownloadQuery } from './executeSqlDownloadQuery';

vi.mock('../../queryRunner/executeQuery', () => ({
    executeSqlQuery: vi.fn(),
}));

const queryResult = {
    queryUuid: 'download-query-uuid',
    fileUrl: undefined,
    results: [],
    columns: [],
} satisfies ResultsAndColumns;

describe('executeSqlDownloadQuery', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(executeSqlQuery).mockResolvedValue(queryResult);
    });

    it('executes all results without the SQL Runner limit', async () => {
        await expect(
            executeSqlDownloadQuery({
                projectUuid: 'project-uuid',
                sql: 'select * from orders',
                limit: null,
            }),
        ).resolves.toBe('download-query-uuid');

        expect(executeSqlQuery).toHaveBeenCalledWith(
            'project-uuid',
            'select * from orders',
            MAX_SAFE_INTEGER,
            undefined,
            true,
        );
    });

    it('executes the requested custom row limit', async () => {
        await executeSqlDownloadQuery({
            projectUuid: 'project-uuid',
            sql: 'select * from orders',
            limit: 42,
            parameterValues: { date_range: 'last 30 days' },
        });

        expect(executeSqlQuery).toHaveBeenCalledWith(
            'project-uuid',
            'select * from orders',
            42,
            { date_range: 'last 30 days' },
            true,
        );
    });
});
