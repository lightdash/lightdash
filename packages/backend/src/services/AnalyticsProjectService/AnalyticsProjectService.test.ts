import { ForbiddenError, NotFoundError } from '@lightdash/common';
import {
    user as baseUser,
    defaultProject,
} from '../ProjectService/ProjectService.mock';
import { AnalyticsProjectService } from './AnalyticsProjectService';

describe('AnalyticsProjectService', () => {
    const user = {
        ...baseUser,
        organizationUuid: 'org',
        organizationName: 'Example',
        organizationCreatedAt: new Date('2026-01-01'),
    };
    const analyticsProject = {
        ...defaultProject,
        projectUuid: 'analytics-project',
        slug: 'lightdash-analytics-1',
        provisioningSource: 'analytics',
        createdAt: new Date('2026-09-10T00:00:00Z'),
    };
    const getAllByOrganizationUuid = vi.fn();
    const assertAnalyticsProjectAccess = vi.fn();
    const ensureAnalyticsProject = vi.fn();
    const deleteProject = vi.fn();
    const invalidateSessionUserCache = vi.fn();
    const lock = vi.fn();
    const service = new AnalyticsProjectService({
        projectModel: {
            getAllByOrganizationUuid,
            runInAnalyticsProvisioningLock: async <T>(
                org: string,
                callback: () => Promise<T>,
            ): Promise<T> => {
                lock(org);
                return callback();
            },
        },
        projectService: {
            assertAnalyticsProjectAccess,
            ensureAnalyticsProject,
            delete: deleteProject,
        },
        userModel: { invalidateSessionUserCache },
    });

    beforeEach(() => {
        vi.resetAllMocks();
        getAllByOrganizationUuid.mockResolvedValue([
            defaultProject,
            analyticsProject,
        ]);
    });

    it('returns only safe metadata for the org-owned analytics project, including its actual slug', async () => {
        const result = await service.getStatus(user);
        expect(assertAnalyticsProjectAccess).toHaveBeenCalledWith(user, {
            organizationUuid: user.organizationUuid,
            provisioningSource: 'analytics',
        });
        expect(getAllByOrganizationUuid).toHaveBeenCalledWith(
            user.organizationUuid,
        );
        expect(result).toEqual({
            project: {
                projectUuid: analyticsProject.projectUuid,
                name: analyticsProject.name,
                slug: 'lightdash-analytics-1',
                url: '/projects/lightdash-analytics-1/tables',
                createdAt: '2026-09-10T00:00:00.000Z',
            },
        });
        expect(ensureAnalyticsProject).not.toHaveBeenCalled();
    });

    it('returns null without provisioning when no analytics project exists', async () => {
        getAllByOrganizationUuid.mockResolvedValue([defaultProject]);
        await expect(service.getStatus(user)).resolves.toEqual({
            project: null,
        });
        expect(ensureAnalyticsProject).not.toHaveBeenCalled();
    });

    it('preserves create-or-get behavior by delegating to the guarded provisioner', async () => {
        const result = {
            projectUuid: 'analytics-project',
            url: '/projects/lightdash-analytics-1/tables',
            created: false,
        };
        ensureAnalyticsProject.mockResolvedValue(result);
        await expect(service.ensure(user)).resolves.toEqual(result);
        expect(ensureAnalyticsProject).toHaveBeenCalledWith(user);
    });

    it.each(['getStatus', 'delete'] as const)(
        'rejects %s before reads or writes when the existing feature/admin guard denies access',
        async (operation) => {
            assertAnalyticsProjectAccess.mockRejectedValue(
                new ForbiddenError('disabled'),
            );
            await expect(
                operation === 'getStatus'
                    ? service.getStatus(user)
                    : service.delete(user, analyticsProject.projectUuid),
            ).rejects.toThrow(ForbiddenError);
            expect(getAllByOrganizationUuid).not.toHaveBeenCalled();
            expect(lock).not.toHaveBeenCalled();
            expect(deleteProject).not.toHaveBeenCalled();
        },
    );

    it('deletes the exact analytics project under the org provisioning lock and invalidates user abilities', async () => {
        await service.delete(user, analyticsProject.projectUuid);
        expect(lock).toHaveBeenCalledWith(user.organizationUuid);
        expect(deleteProject).toHaveBeenCalledWith(
            analyticsProject.projectUuid,
            user,
        );
        expect(invalidateSessionUserCache).toHaveBeenCalledWith(user.userUuid);
    });

    it.each(['other-org-project', 'stale-project', defaultProject.projectUuid])(
        'rejects deletion of %s rather than deleting a different or ordinary project',
        async (projectUuid) => {
            await expect(service.delete(user, projectUuid)).rejects.toThrow(
                NotFoundError,
            );
            expect(deleteProject).not.toHaveBeenCalled();
            expect(invalidateSessionUserCache).not.toHaveBeenCalled();
        },
    );
});
