import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Limit } from '../../../../components/ExportResults/types';
import { executeSqlDownloadQuery } from '../../../../features/sqlRunner/utils/executeSqlDownloadQuery';
import { getAiSqlArtifactDownloadQueryUuid } from './getAiSqlArtifactDownloadQueryUuid';

vi.mock('../../../../features/sqlRunner/utils/executeSqlDownloadQuery', () => ({
    executeSqlDownloadQuery: vi.fn(),
}));

describe('getAiSqlArtifactDownloadQueryUuid', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('reuses the artifact query for table rows', async () => {
        await expect(
            getAiSqlArtifactDownloadQueryUuid({
                projectUuid: 'project-uuid',
                queryUuid: 'artifact-query-uuid',
                sql: 'select * from orders',
                limit: 25,
                limitType: Limit.TABLE,
            }),
        ).resolves.toBe('artifact-query-uuid');

        expect(executeSqlDownloadQuery).not.toHaveBeenCalled();
    });

    it('reruns stored SQL without the artifact limit for all results', async () => {
        vi.mocked(executeSqlDownloadQuery).mockResolvedValue(
            'download-query-uuid',
        );

        await expect(
            getAiSqlArtifactDownloadQueryUuid({
                projectUuid: 'project-uuid',
                queryUuid: 'artifact-query-uuid',
                sql: 'select * from orders',
                limit: null,
                limitType: Limit.ALL,
            }),
        ).resolves.toBe('download-query-uuid');

        expect(executeSqlDownloadQuery).toHaveBeenCalledWith({
            projectUuid: 'project-uuid',
            sql: 'select * from orders',
            limit: null,
        });
    });

    it('reruns stored SQL with the custom row limit', async () => {
        vi.mocked(executeSqlDownloadQuery).mockResolvedValue(
            'custom-download-query-uuid',
        );

        await expect(
            getAiSqlArtifactDownloadQueryUuid({
                projectUuid: 'project-uuid',
                queryUuid: 'artifact-query-uuid',
                sql: 'select * from orders',
                limit: 42,
                limitType: Limit.CUSTOM,
            }),
        ).resolves.toBe('custom-download-query-uuid');

        expect(executeSqlDownloadQuery).toHaveBeenCalledWith({
            projectUuid: 'project-uuid',
            sql: 'select * from orders',
            limit: 42,
        });
    });
});
