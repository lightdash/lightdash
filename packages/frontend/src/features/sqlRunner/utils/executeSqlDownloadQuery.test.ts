import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeSqlQuery } from '../../queryRunner/executeQuery';
import { executeSqlDownloadQuery } from './executeSqlDownloadQuery';

vi.mock('../../queryRunner/executeQuery', () => ({
    executeSqlQuery: vi.fn(async () => ({ queryUuid: 'download-query' })),
}));

describe('executeSqlDownloadQuery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it.each([
        { name: 'an extra connection', connection: 'finance-uuid' },
        { name: 'the original as null', connection: null },
        { name: 'no connection', connection: undefined },
    ])('re-runs the SQL on $name', async ({ connection }) => {
        await executeSqlDownloadQuery({
            projectUuid: 'project-uuid',
            sql: 'select 1',
            limit: 100,
            parameterValues: {},
            warehouseConnectionUuid: connection,
        });

        expect(executeSqlQuery).toHaveBeenCalledWith(
            'project-uuid',
            'select 1',
            100,
            {},
            true,
            connection,
        );
    });
});
