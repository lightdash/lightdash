import {
    ConflictError,
    ContentType,
    ForbiddenError,
    NotFoundError,
} from '@lightdash/common';
import { UsageHistoryBackfill } from '../../../analytics/eventStream/UsageHistoryBackfill';
import {
    analyticsContentAsCode,
    analyticsDefaultSpace,
} from '../../../analytics/systemExplores/sampleContent';
import * as analyticsExplores from '../../../services/ProjectService/analyticsProject/createAnalyticsExplores';
import {
    user as baseUser,
    defaultProject,
} from '../../../services/ProjectService/ProjectService.mock';
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
    const saveExploresToCache = vi.fn();
    const getAnalyticsModelCounts = vi.fn();
    const modelCounts = analyticsExplores
        .createAnalyticsExplores()
        .map((explore) => ({
            name: explore.name,
            fields: Object.values(explore.tables).reduce(
                (total, table) =>
                    total +
                    Object.keys(table.dimensions).length +
                    Object.keys(table.metrics).length,
                0,
            ),
            hiddenJoins: explore.joinedTables.filter((join) => join.hidden)
                .length,
        }));
    const assertAnalyticsProjectAdministration = vi.fn();
    const ensureAnalyticsProject = vi.fn();
    const deleteProject = vi.fn();
    const invalidateSessionUserCache = vi.fn();
    const lock = vi.fn();
    const upsertChart = vi.fn();
    const upsertDashboard = vi.fn();
    const findDashboard = vi.fn();
    const getDashboard = vi.fn();
    const findCharts = vi.fn();
    const getChart = vi.fn();
    const getSpace = vi.fn();
    const findSpaces = vi.fn();
    const getVerifications = vi.fn();
    const getUsageHistoryBackfillJob = vi.fn();
    const scheduleUsageHistoryBackfill = vi.fn();
    const findProcessingStatus = vi.fn();
    const service = new AnalyticsProjectService({
        lightdashConfig: {
            usageEvents: {
                enabled: false,
                s3: null,
                flushIntervalMs: 1000,
                flushBatchSize: 1000,
                bufferMaxSize: 1000,
            },
        },
        schedulerClient: {
            getUsageHistoryBackfillJob,
            scheduleUsageHistoryBackfill,
        },
        coderService: { upsertChart, upsertDashboard },
        contentVerificationModel: { getByContentUuids: getVerifications },
        dashboardModel: { find: findDashboard, getByIdOrSlug: getDashboard },
        savedChartModel: { get: getChart, find: findCharts },
        spaceModel: { get: getSpace, find: findSpaces },
        projectModel: {
            getAllByOrganizationUuid,
            saveExploresToCache,
            getAnalyticsModelCounts,
            runInAnalyticsProvisioningLock: async <T>(
                org: string,
                callback: () => Promise<T>,
            ): Promise<T> => {
                lock(org);
                return callback();
            },
        },
        projectService: {
            assertAnalyticsProjectAdministration,
            ensureAnalyticsProject,
            delete: deleteProject,
        },
        userModel: { invalidateSessionUserCache },
        usageProcessingModel: { find: findProcessingStatus },
    });

    beforeEach(() => {
        vi.restoreAllMocks();
        vi.resetAllMocks();
        findProcessingStatus.mockResolvedValue(null);
        findDashboard.mockResolvedValue([
            { uuid: 'existing-dashboard', spaceUuid: 'existing-space' },
        ]);
        getSpace.mockResolvedValue({
            uuid: 'existing-space',
            path: 'lightdash_analytics_default_dashboards',
            name: analyticsDefaultSpace.name,
        });
        findSpaces.mockResolvedValue([{ uuid: 'existing-space' }]);
        getDashboard.mockRejectedValue(new NotFoundError('missing'));
        getVerifications.mockImplementation(
            async (_type, uuids) =>
                new Map(uuids.map((uuid: string) => [uuid, {}])),
        );
        findCharts.mockResolvedValue(
            analyticsContentAsCode.flatMap(({ charts }) =>
                charts.map(({ slug }) => ({ slug })),
            ),
        );
        getAnalyticsModelCounts.mockResolvedValue(modelCounts);
        getChart.mockRejectedValue(new NotFoundError('missing'));
        getAllByOrganizationUuid.mockResolvedValue([
            defaultProject,
            analyticsProject,
        ]);
    });

    describe('history backfill administration', () => {
        const storage = {
            endpoint: 'http://localhost:9000',
            bucket: 'backfill-test',
            region: 'us-east-1',
            accessKey: 'test',
            secretKey: 'test',
        };
        const configuredService = () =>
            new AnalyticsProjectService({
                ...service['dependencies'],
                lightdashConfig: {
                    usageEvents: {
                        ...service['dependencies'].lightdashConfig.usageEvents,
                        enabled: true,
                        s3: storage,
                    },
                },
            });
        const created = {
            projectUuid: analyticsProject.projectUuid,
            url: `/projects/${analyticsProject.projectUuid}/tables`,
            created: true,
        };

        it('queues retained history for a newly provisioned project after authorized content installation', async () => {
            ensureAnalyticsProject.mockResolvedValue(created);
            await expect(configuredService().ensure(user)).resolves.toEqual(
                created,
            );
            expect(ensureAnalyticsProject).toHaveBeenCalledExactlyOnceWith(
                user,
            );
            expect(
                assertAnalyticsProjectAdministration,
            ).toHaveBeenCalledExactlyOnceWith(user);
            expect(lock).toHaveBeenCalledWith(user.organizationUuid);
            expect(
                scheduleUsageHistoryBackfill,
            ).toHaveBeenCalledExactlyOnceWith({
                organizationUuid: user.organizationUuid,
                projectUuid: created.projectUuid,
                userUuid: user.userUuid,
            });
            const scheduledAt =
                scheduleUsageHistoryBackfill.mock.invocationCallOrder[0];
            expect(
                ensureAnalyticsProject.mock.invocationCallOrder[0],
            ).toBeLessThan(scheduledAt);
            expect(
                assertAnalyticsProjectAdministration.mock
                    .invocationCallOrder[0],
            ).toBeLessThan(scheduledAt);
            expect(upsertDashboard).toHaveBeenCalledTimes(
                analyticsContentAsCode.length,
            );
            expect(
                upsertDashboard.mock.invocationCallOrder.at(-1),
            ).toBeLessThan(scheduledAt);
        });

        it('does not automatically backfill an existing project during content synchronization', async () => {
            const existing = { ...created, created: false };
            ensureAnalyticsProject.mockResolvedValue(existing);
            await expect(configuredService().ensure(user)).resolves.toEqual(
                existing,
            );
            expect(upsertDashboard).toHaveBeenCalled();
            expect(scheduleUsageHistoryBackfill).not.toHaveBeenCalled();
        });

        it('preserves successful project creation when automatic history scheduling fails', async () => {
            ensureAnalyticsProject.mockResolvedValue(created);
            scheduleUsageHistoryBackfill.mockRejectedValue(
                new Error('queue unavailable'),
            );
            await expect(configuredService().ensure(user)).resolves.toEqual(
                created,
            );
            expect(scheduleUsageHistoryBackfill).toHaveBeenCalledOnce();
            expect(upsertDashboard).toHaveBeenCalledTimes(
                analyticsContentAsCode.length,
            );
            expect(deleteProject).not.toHaveBeenCalled();
        });

        it.each([
            { enabled: false, s3: storage },
            { enabled: true, s3: null },
        ])(
            'does not schedule automatically when usage storage is unavailable: %j',
            async (configuration) => {
                ensureAnalyticsProject.mockResolvedValue(created);
                const configured = new AnalyticsProjectService({
                    ...service['dependencies'],
                    lightdashConfig: {
                        usageEvents: {
                            ...service['dependencies'].lightdashConfig
                                .usageEvents,
                            ...configuration,
                        },
                    },
                });
                await expect(configured.ensure(user)).resolves.toEqual(created);
                expect(scheduleUsageHistoryBackfill).not.toHaveBeenCalled();
            },
        );

        it('uses current org administration authorization for reads and writes', async () => {
            assertAnalyticsProjectAdministration.mockRejectedValue(
                new ForbiddenError('denied'),
            );
            await expect(
                configuredService().getBackfillStatus(user),
            ).rejects.toThrow('denied');
            await expect(configuredService().backfill(user)).rejects.toThrow(
                'denied',
            );
            expect(getUsageHistoryBackfillJob).not.toHaveBeenCalled();
            expect(scheduleUsageHistoryBackfill).not.toHaveBeenCalled();
        });

        it('requires an org-owned Analytics project and configured event storage', async () => {
            await expect(service.backfill(user)).rejects.toThrow(ConflictError);
            getAllByOrganizationUuid.mockResolvedValue([defaultProject]);
            await expect(configuredService().backfill(user)).rejects.toThrow(
                NotFoundError,
            );
            expect(scheduleUsageHistoryBackfill).not.toHaveBeenCalled();
        });

        it('shows a running job without performing another coverage scan', async () => {
            getUsageHistoryBackfillJob.mockResolvedValue({
                running: true,
                failed: false,
            });
            await expect(
                configuredService().getBackfillStatus(user),
            ).resolves.toMatchObject({ running: true, completed: false });
            expect(getUsageHistoryBackfillJob).toHaveBeenCalledWith(
                user.organizationUuid,
            );
        });

        it('checks only the completion signal on every page visit', async () => {
            getUsageHistoryBackfillJob.mockResolvedValue({
                running: false,
                failed: false,
            });
            const complete = vi
                .spyOn(UsageHistoryBackfill.prototype, 'isComplete')
                .mockResolvedValueOnce(false)
                .mockResolvedValue(true);
            const configured = configuredService();
            await expect(
                configured.getBackfillStatus(user),
            ).resolves.toMatchObject({ completed: false });
            await expect(
                configured.getBackfillStatus(user),
            ).resolves.toMatchObject({ completed: true });
            expect(complete).toHaveBeenCalledTimes(2);
            expect(complete).toHaveBeenCalledWith(user.organizationUuid);
        });

        it('keeps failed runs retryable without a coverage scan or trusting an older marker', async () => {
            getUsageHistoryBackfillJob.mockResolvedValue({
                running: false,
                failed: true,
            });
            const complete = vi.spyOn(
                UsageHistoryBackfill.prototype,
                'isComplete',
            );
            await expect(
                configuredService().getBackfillStatus(user),
            ).resolves.toMatchObject({
                completed: false,
                error: 'The previous backfill failed. You can retry safely.',
            });
            expect(complete).not.toHaveBeenCalled();
        });

        it('enqueues only the authenticated org and allows safe direct reruns', async () => {
            await configuredService().backfill(user);
            await configuredService().backfill(user);
            expect(scheduleUsageHistoryBackfill).toHaveBeenCalledTimes(2);
            expect(scheduleUsageHistoryBackfill).toHaveBeenLastCalledWith({
                organizationUuid: user.organizationUuid,
                userUuid: user.userUuid,
                projectUuid: '',
                schedulerUuid: undefined,
            });
            expect(saveExploresToCache).toHaveBeenCalledWith(
                analyticsProject.projectUuid,
                analyticsExplores.createAnalyticsExplores(),
                true,
            );
            expect(
                saveExploresToCache.mock.invocationCallOrder[0],
            ).toBeLessThan(
                scheduleUsageHistoryBackfill.mock.invocationCallOrder[0],
            );
            expect(upsertChart).not.toHaveBeenCalled();
            expect(upsertDashboard).not.toHaveBeenCalled();
        });

        it('does not queue a backfill when refreshing the models fails', async () => {
            saveExploresToCache.mockRejectedValueOnce(
                new Error('cache failed'),
            );
            await expect(configuredService().backfill(user)).rejects.toThrow(
                'cache failed',
            );
            expect(scheduleUsageHistoryBackfill).not.toHaveBeenCalled();
        });

        it('does not mistake unavailable storage for completed or missing history', async () => {
            getUsageHistoryBackfillJob.mockResolvedValue({
                running: false,
                failed: false,
            });
            vi.spyOn(
                UsageHistoryBackfill.prototype,
                'isComplete',
            ).mockRejectedValue(
                new Error('Unable to check analytics backfill status'),
            );
            await expect(
                configuredService().getBackfillStatus(user),
            ).rejects.toThrow('Unable to check analytics backfill status');
        });
    });

    it('returns only safe metadata for the org-owned analytics project, including its actual slug', async () => {
        findDashboard.mockResolvedValue(
            analyticsContentAsCode.map(({ dashboard }) => ({
                slug: dashboard.slug,
            })),
        );
        const result = await service.getStatus(user);
        expect(assertAnalyticsProjectAdministration).toHaveBeenCalledWith(user);
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
                hasContentUpdates: false,
                processing: null,
            },
        });
        expect(ensureAnalyticsProject).not.toHaveBeenCalled();
        expect(findProcessingStatus).toHaveBeenCalledWith(
            user.organizationUuid,
        );
        expect(getAnalyticsModelCounts).toHaveBeenCalledExactlyOnceWith(
            analyticsProject.projectUuid,
            analyticsExplores.analyticsExploreNames,
        );
        expect(findDashboard).toHaveBeenCalledExactlyOnceWith({
            projectUuid: analyticsProject.projectUuid,
            slugs: analyticsContentAsCode.map(
                ({ dashboard }) => dashboard.slug,
            ),
        });
        expect(saveExploresToCache).not.toHaveBeenCalled();
        expect(upsertDashboard).not.toHaveBeenCalled();
        expect(findCharts).toHaveBeenCalledExactlyOnceWith({
            projectUuid: analyticsProject.projectUuid,
            slugs: analyticsContentAsCode.flatMap(({ charts }) =>
                charts.map(({ slug }) => slug),
            ),
        });
    });

    it('flags missing models even when all managed dashboards exist', async () => {
        getAnalyticsModelCounts.mockResolvedValue(modelCounts.slice(1));
        findDashboard.mockResolvedValue(
            analyticsContentAsCode.map(({ dashboard }) => ({
                slug: dashboard.slug,
            })),
        );
        expect((await service.getStatus(user)).project?.hasContentUpdates).toBe(
            true,
        );
    });

    it('flags missing dashboards even when all models exist', async () => {
        findDashboard.mockResolvedValue([]);
        expect((await service.getStatus(user)).project?.hasContentUpdates).toBe(
            true,
        );
    });

    it('offers sync when a built-in dashboard has not yet been verified', async () => {
        findDashboard.mockResolvedValue(
            analyticsContentAsCode.map(({ dashboard }) => ({
                uuid: dashboard.slug,
                slug: dashboard.slug,
            })),
        );
        getVerifications.mockResolvedValue(new Map());
        expect((await service.getStatus(user)).project?.hasContentUpdates).toBe(
            true,
        );
        expect(getVerifications).toHaveBeenCalledWith(
            ContentType.DASHBOARD,
            analyticsContentAsCode.map(({ dashboard }) => dashboard.slug),
        );
    });

    it('flags new charts in an existing dashboard when models and dashboards are current', async () => {
        findDashboard.mockResolvedValue(
            analyticsContentAsCode.map(({ dashboard }) => ({
                slug: dashboard.slug,
            })),
        );
        findCharts.mockResolvedValue(
            analyticsContentAsCode.flatMap(({ charts }) =>
                charts
                    .filter(({ tableName }) => tableName !== 'semantic_usage')
                    .map(({ slug }) => ({ slug })),
            ),
        );
        expect((await service.getStatus(user)).project?.hasContentUpdates).toBe(
            true,
        );
        expect(upsertChart).not.toHaveBeenCalled();
        expect(upsertDashboard).not.toHaveBeenCalled();
    });

    it('ignores custom models when managed counts match', async () => {
        getAnalyticsModelCounts.mockResolvedValue([
            ...modelCounts,
            { name: 'custom_model', fields: 1, hiddenJoins: 0 },
        ]);
        findDashboard.mockResolvedValue(
            analyticsContentAsCode.map(({ dashboard }) => ({
                slug: dashboard.slug,
            })),
        );
        expect((await service.getStatus(user)).project?.hasContentUpdates).toBe(
            false,
        );
    });

    it.each(['fields', 'hiddenJoins'] as const)(
        'flags changed %s counts without new models or dashboards',
        async (key) => {
            findDashboard.mockResolvedValue(
                analyticsContentAsCode.map(({ dashboard }) => ({
                    slug: dashboard.slug,
                })),
            );
            getAnalyticsModelCounts.mockResolvedValue(
                modelCounts.map((model, index) =>
                    index === 0 ? { ...model, [key]: model[key] + 1 } : model,
                ),
            );
            expect(
                (await service.getStatus(user)).project?.hasContentUpdates,
            ).toBe(true);
            expect(saveExploresToCache).not.toHaveBeenCalled();
        },
    );

    it('checks authorization before reading content counts', async () => {
        assertAnalyticsProjectAdministration.mockRejectedValue(
            new ForbiddenError('Not allowed'),
        );
        await expect(service.getStatus(user)).rejects.toThrow('Not allowed');
        expect(getAnalyticsModelCounts).not.toHaveBeenCalled();
        expect(findDashboard).not.toHaveBeenCalled();
        expect(findCharts).not.toHaveBeenCalled();
        expect(findProcessingStatus).not.toHaveBeenCalled();
    });

    it('returns processing status only for the authorized organization', async () => {
        const processing = {
            status: 'partial',
            startedAt: '2026-10-30T00:30:00.000Z',
            finishedAt: '2026-10-30T00:42:00.000Z',
            lastSuccessfulAt: '2026-10-29T00:42:00.000Z',
            stats: {
                partitionsDiscovered: 2,
                partitionsCompacted: 2,
                partitionsFailed: 0,
                rawObjectsDeleted: 3,
                dimensionsFailed: 1,
                userPartitionsFailed: 0,
                userPartitionsDeferred: 0,
                limitReached: false,
            },
        };
        findProcessingStatus.mockResolvedValue(processing);
        expect((await service.getStatus(user)).project?.processing).toEqual(
            processing,
        );
        expect(findProcessingStatus).toHaveBeenCalledExactlyOnceWith(
            user.organizationUuid,
        );
    });

    it('returns null without provisioning when no analytics project exists', async () => {
        getAllByOrganizationUuid.mockResolvedValue([defaultProject]);
        await expect(service.getStatus(user)).resolves.toEqual({
            project: null,
        });
        expect(getAnalyticsModelCounts).not.toHaveBeenCalled();
        expect(findDashboard).not.toHaveBeenCalled();
        expect(findCharts).not.toHaveBeenCalled();
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
                spaceNames: {
                    [dashboard.spaceSlug]: analyticsDefaultSpace.name,
                },
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

    it('keeps existing dashboards and their charts in their current space on sync', async () => {
        getSpace.mockResolvedValue({
            uuid: 'existing-space',
            path: 'restricted.existing_dashboards',
            name: 'Existing dashboards',
            inheritParentPermissions: false,
        });
        await service.installSampleContent(user);
        expect(getSpace).toHaveBeenCalledWith('existing-space');
        for (const [, , , content] of [
            ...upsertChart.mock.calls,
            ...upsertDashboard.mock.calls,
        ]) {
            expect(content.spaceSlug).toBe('restricted/existing-dashboards');
        }
        for (const [, , , content] of upsertDashboard.mock.calls) {
            expect(content.verified).toBe(true);
        }
    });

    it('fails rather than moving existing content when its space path is ambiguous', async () => {
        findSpaces.mockResolvedValue([
            { uuid: 'other-space' },
            { uuid: 'existing-space' },
        ]);
        await expect(service.installSampleContent(user)).rejects.toThrow(
            ConflictError,
        );
        expect(upsertDashboard).not.toHaveBeenCalled();
        expect(upsertChart).not.toHaveBeenCalled();
    });

    it('restores a deleted dashboard in its existing restricted space', async () => {
        findDashboard.mockResolvedValue([]);
        getDashboard.mockResolvedValue({ spaceUuid: 'existing-space' });
        getSpace.mockResolvedValue({
            uuid: 'existing-space',
            path: 'restricted.existing_dashboards',
            name: 'Existing dashboards',
            inheritParentPermissions: false,
        });
        await service.installSampleContent(user);
        expect(getDashboard).toHaveBeenCalledWith(
            analyticsContentAsCode[0].dashboard.slug,
            { projectUuid: 'analytics-project', deleted: true },
        );
        expect(upsertDashboard.mock.calls[0][3]).toMatchObject({
            spaceSlug: 'restricted/existing-dashboards',
            verified: false,
        });
        expect(upsertDashboard.mock.calls[1][3]).toMatchObject({
            spaceSlug: 'restricted/existing-dashboards',
            verified: true,
        });
    });

    it('refreshes all system explores under the org lock before uploading any content', async () => {
        await service.installSampleContent(user);
        expect(saveExploresToCache).toHaveBeenCalledExactlyOnceWith(
            analyticsProject.projectUuid,
            analyticsExplores.createAnalyticsExplores(),
            true,
        );
        const explores = saveExploresToCache.mock.calls[0][1];
        expect(explores.map(({ name }: { name: string }) => name)).toEqual(
            expect.arrayContaining([
                'ai_usage',
                'query_events',
                'data_app_events',
                'export_events',
            ]),
        );
        expect(lock.mock.invocationCallOrder[0]).toBeLessThan(
            saveExploresToCache.mock.invocationCallOrder[0],
        );
        expect(saveExploresToCache.mock.invocationCallOrder[0]).toBeLessThan(
            upsertChart.mock.invocationCallOrder[0],
        );
        expect(saveExploresToCache.mock.invocationCallOrder[0]).toBeLessThan(
            upsertDashboard.mock.invocationCallOrder[0],
        );
        expect(deleteProject).not.toHaveBeenCalled();
        expect(ensureAnalyticsProject).not.toHaveBeenCalled();
    });

    it('does not upload content if model compilation fails', async () => {
        vi.spyOn(
            analyticsExplores,
            'createAnalyticsExplores',
        ).mockImplementationOnce(() => {
            throw new Error('compile failed');
        });
        await expect(service.installSampleContent(user)).rejects.toThrow(
            'compile failed',
        );
        expect(saveExploresToCache).not.toHaveBeenCalled();
        expect(upsertChart).not.toHaveBeenCalled();
        expect(upsertDashboard).not.toHaveBeenCalled();
    });

    it('does not upload content if saving models fails, and allows retrying', async () => {
        saveExploresToCache.mockRejectedValueOnce(new Error('save failed'));
        await expect(service.installSampleContent(user)).rejects.toThrow(
            'save failed',
        );
        expect(upsertChart).not.toHaveBeenCalled();
        expect(upsertDashboard).not.toHaveBeenCalled();
        await service.installSampleContent(user);
        expect(saveExploresToCache).toHaveBeenCalledTimes(2);
        expect(upsertDashboard).toHaveBeenCalledTimes(
            analyticsContentAsCode.length,
        );
    });

    it('does not install into an ordinary project when analytics has not been provisioned', async () => {
        getAllByOrganizationUuid.mockResolvedValue([defaultProject]);
        await expect(service.installSampleContent(user)).rejects.toThrow(
            NotFoundError,
        );
        expect(upsertChart).not.toHaveBeenCalled();
        expect(upsertDashboard).not.toHaveBeenCalled();
        expect(saveExploresToCache).not.toHaveBeenCalled();
    });

    it.each(['getStatus', 'delete', 'installSampleContent'] as const)(
        'rejects %s before reads or writes when the existing feature/admin guard denies access',
        async (operation) => {
            assertAnalyticsProjectAdministration.mockRejectedValue(
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
            expect(saveExploresToCache).not.toHaveBeenCalled();
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
            verified: false,
            tiles: [],
            filters: { dimensions: [], metrics: [], tableCalculations: [] },
        });
        for (const [, , , content] of upsertDashboard.mock.calls) {
            if (content.tiles.length === 0)
                expect(content.filters?.dimensions).toEqual([]);
        }
        expect(upsertDashboard.mock.invocationCallOrder[0]).toBeLessThan(
            upsertChart.mock.invocationCallOrder[0],
        );
        expect(upsertDashboard.mock.calls[1][3]).toEqual(dashboard);
        expect(getSpace).not.toHaveBeenCalled();
    });

    it('does not verify an empty new dashboard when its chart upload fails', async () => {
        findDashboard.mockResolvedValue([]);
        upsertChart.mockRejectedValueOnce(new Error('upload failed'));
        await expect(service.installSampleContent(user)).rejects.toThrow(
            'upload failed',
        );
        expect(upsertDashboard).toHaveBeenCalledTimes(1);
        expect(upsertDashboard.mock.calls[0][3].verified).toBe(false);
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
