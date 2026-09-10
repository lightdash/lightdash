import {
    ConflictError,
    ForbiddenError,
    NotFoundError,
} from '@lightdash/common';
import { analyticsContentAsCode } from '../../analytics/systemExplores/sampleContent';
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
    const upsertChart = vi.fn();
    const upsertDashboard = vi.fn();
    const findDashboard = vi.fn();
    const getChart = vi.fn();
    const service = new AnalyticsProjectService({
        coderService: { upsertChart, upsertDashboard },
        dashboardModel: { find: findDashboard },
        savedChartModel: { get: getChart },
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
        findDashboard.mockResolvedValue([{ uuid: 'existing-dashboard' }]);
        getChart.mockRejectedValue(new NotFoundError('missing'));
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
        expect(upsertDashboard).toHaveBeenCalledTimes(
            analyticsContentAsCode.length,
        );
    });

    it('installs sample content only in the current organization analytics project', async () => {
        await service.installSampleContent(user);
        expect(lock).toHaveBeenCalledWith(user.organizationUuid);
        for (const { dashboard, charts } of analyticsContentAsCode) {
            const options = {
                spaceNames: { [dashboard.spaceSlug]: dashboard.name },
                publicSpaceCreate: true,
                force: true,
            };
            for (const chart of charts) {
                expect(upsertChart).toHaveBeenCalledWith(
                    user,
                    'analytics-project',
                    chart.slug,
                    chart,
                    options,
                );
            }
            expect(upsertDashboard).toHaveBeenCalledWith(
                user,
                'analytics-project',
                dashboard.slug,
                dashboard,
                options,
            );
        }
    });

    it('does not install into an ordinary project when analytics has not been provisioned', async () => {
        getAllByOrganizationUuid.mockResolvedValue([defaultProject]);
        await expect(service.installSampleContent(user)).rejects.toThrow(
            NotFoundError,
        );
        expect(upsertChart).not.toHaveBeenCalled();
        expect(upsertDashboard).not.toHaveBeenCalled();
    });

    it.each(['getStatus', 'delete', 'installSampleContent'] as const)(
        'rejects %s before reads or writes when the existing feature/admin guard denies access',
        async (operation) => {
            assertAnalyticsProjectAccess.mockRejectedValue(
                new ForbiddenError('disabled'),
            );
            const operations = {
                getStatus: () => service.getStatus(user),
                installSampleContent: () => service.installSampleContent(user),
                delete: () =>
                    service.delete(user, analyticsProject.projectUuid),
            };
            await expect(operations[operation]()).rejects.toThrow(
                ForbiddenError,
            );
            expect(getAllByOrganizationUuid).not.toHaveBeenCalled();
            expect(lock).not.toHaveBeenCalled();
            expect(deleteProject).not.toHaveBeenCalled();
            expect(upsertChart).not.toHaveBeenCalled();
            expect(upsertDashboard).not.toHaveBeenCalled();
        },
    );

    it('uploads every chart before resolving its dashboard layout', async () => {
        const operations: string[] = [];
        upsertChart.mockImplementation(async (_user, _project, slug) => {
            operations.push(slug);
        });
        upsertDashboard.mockImplementation(async (_user, _project, slug) => {
            operations.push(slug);
        });
        await service.installSampleContent(user);
        expect(operations).toEqual(
            analyticsContentAsCode.flatMap(({ dashboard, charts }) => [
                ...charts.map(({ slug }) => slug),
                dashboard.slug,
            ]),
        );
    });

    it('creates or restores a missing dashboard before uploading its charts', async () => {
        findDashboard.mockResolvedValue([]);
        await service.installSampleContent(user);
        const { dashboard } = analyticsContentAsCode[0];
        expect(findDashboard).toHaveBeenCalledWith({
            projectUuid: 'analytics-project',
            slug: dashboard.slug,
        });
        expect(upsertDashboard.mock.calls[0][3]).toEqual({
            ...dashboard,
            tiles: [],
        });
        expect(upsertDashboard.mock.invocationCallOrder[0]).toBeLessThan(
            upsertChart.mock.invocationCallOrder[0],
        );
        expect(upsertDashboard.mock.calls[1][3]).toEqual(dashboard);
    });

    it('retries the same slug targets after a partial upload failure', async () => {
        upsertChart.mockRejectedValueOnce(new Error('upload failed'));
        await expect(service.installSampleContent(user)).rejects.toThrow(
            'upload failed',
        );
        expect(upsertDashboard).not.toHaveBeenCalled();
        await service.installSampleContent(user);
        expect(upsertChart.mock.calls[0]).toEqual(upsertChart.mock.calls[1]);
        expect(upsertDashboard).toHaveBeenCalledTimes(
            analyticsContentAsCode.length,
        );
    });

    it.each([
        {
            slug: 'different-canonical-slug',
            dashboardSlug: 'lightdash-analytics-overview',
        },
        {
            slug: 'lightdash-analytics-overview-ai-calls',
            dashboardSlug: 'custom-dashboard',
        },
        { slug: 'lightdash-analytics-overview-ai-calls', dashboardSlug: null },
    ])(
        'rejects a renamed or moved chart before writing any content: %j',
        async (existing) => {
            getChart.mockResolvedValueOnce(existing);
            await expect(service.installSampleContent(user)).rejects.toThrow(
                ConflictError,
            );
            expect(upsertChart).not.toHaveBeenCalled();
            expect(upsertDashboard).not.toHaveBeenCalled();
            expect(getChart).toHaveBeenCalledWith(
                'lightdash-analytics-overview-ai-calls',
                undefined,
                {
                    projectUuid: 'analytics-project',
                    deleted: 'any',
                },
            );
        },
    );

    it('propagates lookup errors instead of treating them as missing content', async () => {
        getChart.mockRejectedValueOnce(new Error('database unavailable'));
        await expect(service.installSampleContent(user)).rejects.toThrow(
            'database unavailable',
        );
        expect(upsertDashboard).not.toHaveBeenCalled();
        expect(upsertChart).not.toHaveBeenCalled();
    });

    it('uses identical project-scoped slugs on repeated syncs', async () => {
        await service.installSampleContent(user);
        const firstCharts = [...upsertChart.mock.calls];
        const firstDashboards = [...upsertDashboard.mock.calls];
        await service.installSampleContent(user);
        expect(upsertChart.mock.calls.slice(firstCharts.length)).toEqual(
            firstCharts,
        );
        expect(
            upsertDashboard.mock.calls.slice(firstDashboards.length),
        ).toEqual(firstDashboards);
    });

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
