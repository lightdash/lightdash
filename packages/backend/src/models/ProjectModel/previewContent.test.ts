import { omitProjectUuid, replaceProjectUuid } from './previewContent';

describe('omitProjectUuid', () => {
    it.each([
        {
            row: {
                saved_query_uuid: 'chart-uuid',
                project_uuid: 'source-project-uuid',
            },
        },
        {
            row: {
                dashboard_uuid: 'dashboard-uuid',
                project_uuid: 'source-project-uuid',
            },
        },
    ])(
        'omits ownership from preview rows without mutating the source',
        ({ row }) => {
            const result = omitProjectUuid(row);

            expect(result).not.toHaveProperty('project_uuid');
            expect(row).toHaveProperty('project_uuid', 'source-project-uuid');
        },
    );
});

describe('replaceProjectUuid', () => {
    it.each([
        {
            row: {
                saved_query_uuid: 'chart-uuid',
                project_uuid: 'source-project-uuid',
            },
        },
        {
            row: {
                dashboard_uuid: 'dashboard-uuid',
                project_uuid: 'source-project-uuid',
            },
        },
    ])(
        'sets destination ownership without mutating the source row',
        ({ row }) => {
            const result = replaceProjectUuid(row, 'destination-project-uuid');

            expect(result.project_uuid).toBe('destination-project-uuid');
            expect(row.project_uuid).toBe('source-project-uuid');
        },
    );
});
