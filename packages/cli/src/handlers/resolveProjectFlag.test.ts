import { ParameterError, ProjectType } from '@lightdash/common';
import type { MockedFunction } from 'vitest';
import { lightdashApi } from './dbt/apiClient';
import { resolveProjectFlag } from './resolveProjectFlag';

vi.mock('./dbt/apiClient', () => ({
    lightdashApi: vi.fn(),
}));

const mockLightdashApi = lightdashApi as MockedFunction<typeof lightdashApi>;

const PROJECT_UUID = '00000000-0000-0000-0000-000000000001';
const OTHER_UUID = '00000000-0000-0000-0000-000000000002';

const mockOrgProjects = (
    projects: { projectUuid: string; slug?: string; name: string }[],
) => {
    mockLightdashApi.mockResolvedValueOnce(
        projects.map((project) => ({
            ...project,
            type: ProjectType.DEFAULT,
        })) as never,
    );
};

describe('resolveProjectFlag', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('returns a UUID as-is without calling the API', async () => {
        await expect(resolveProjectFlag(PROJECT_UUID)).resolves.toBe(
            PROJECT_UUID,
        );
        expect(mockLightdashApi).not.toHaveBeenCalled();
    });

    it('resolves a slug to the matching project UUID', async () => {
        mockOrgProjects([
            { projectUuid: OTHER_UUID, slug: 'other', name: 'Other' },
            { projectUuid: PROJECT_UUID, slug: 'jaffle-shop', name: 'Jaffle' },
        ]);

        await expect(resolveProjectFlag('jaffle-shop')).resolves.toBe(
            PROJECT_UUID,
        );
        expect(mockLightdashApi).toHaveBeenCalledWith(
            expect.objectContaining({ url: '/api/v1/org/projects' }),
        );
    });

    it('fails with an actionable error for an unknown slug', async () => {
        mockOrgProjects([
            { projectUuid: PROJECT_UUID, slug: 'jaffle-shop', name: 'Jaffle' },
            { projectUuid: OTHER_UUID, name: 'No slug' },
        ]);

        await expect(resolveProjectFlag('missing')).rejects.toThrow(
            ParameterError,
        );
    });

    it('fails when a slug matches more than one project', async () => {
        mockOrgProjects([
            { projectUuid: PROJECT_UUID, slug: 'dup', name: 'A' },
            { projectUuid: OTHER_UUID, slug: 'dup', name: 'B' },
        ]);

        await expect(resolveProjectFlag('dup')).rejects.toThrow(
            /more than one project/,
        );
    });
});
