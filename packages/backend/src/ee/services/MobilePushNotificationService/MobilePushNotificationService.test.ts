import { NotFoundError, ParameterError } from '@lightdash/common';
import {
    MobilePushNotificationService,
    type MobilePushNotificationStore,
    type MobilePushThreadStore,
} from './MobilePushNotificationService';

const organizationUuid = '00000000-0000-0000-0000-000000000001';
const userUuid = '00000000-0000-0000-0000-000000000002';
const installationUuid = '00000000-0000-0000-0000-000000000003';
const projectUuid = '00000000-0000-0000-0000-000000000004';
const agentUuid = '00000000-0000-0000-0000-000000000005';
const threadUuid = '00000000-0000-0000-0000-000000000006';
const promptUuid = '00000000-0000-0000-0000-000000000007';
const liveActivityUuid = '00000000-0000-0000-0000-000000000008';

const installation = {
    mobilePushInstallationUuid: installationUuid,
    installationUuid,
    organizationUuid,
    userUuid,
    environment: 'sandbox' as const,
};

const threadOwnership = {
    threadUuid,
    projectUuid,
    agentUuid,
    ownerUserUuid: userUuid,
    createdFrom: 'web_app' as const,
    ownerIsServiceAccount: false,
};

const prompt = {
    organizationUuid,
    projectUuid,
    promptUuid,
    threadUuid,
    agentUuid,
    createdByUserUuid: userUuid,
};

const createDependencies = () => {
    const mobilePushNotificationStore = {
        findInstallation: vi.fn(async () => installation),
        findLiveActivityOwner: vi.fn<
            MobilePushNotificationStore['findLiveActivityOwner']
        >(async () => undefined),
        upsertInstallation: vi.fn(async () => installation),
        deleteInstallation: vi.fn(async () => undefined),
        upsertLiveActivity: vi.fn(async () => undefined),
        deleteLiveActivity: vi.fn(async () => undefined),
        findActiveLiveActivitiesForThread: vi.fn<
            MobilePushNotificationStore['findActiveLiveActivitiesForThread']
        >(async () => []),
        findLiveActivitiesDueForReconciliation: vi.fn<
            MobilePushNotificationStore['findLiveActivitiesDueForReconciliation']
        >(async () => []),
    } satisfies MobilePushNotificationStore;
    const threadStore = {
        findThreadOwnership: vi.fn<
            MobilePushThreadStore['findThreadOwnership']
        >(async () => threadOwnership),
        findWebAppPrompt: vi.fn<MobilePushThreadStore['findWebAppPrompt']>(
            async () => prompt,
        ),
    } satisfies MobilePushThreadStore;

    return {
        mobilePushNotificationStore,
        threadStore,
        mobilePushNotificationsConfig: {
            enabled: true,
            bundleId: 'com.lightdash.mobile',
            teamId: 'TEAMID',
            sandbox: { keyId: 'KEYID', privateKey: 'private-key' },
            production: undefined,
        },
        scheduler: {
            mobilePushLiveActivity: vi.fn(async () => ({
                jobId: 'job-uuid',
            })),
        },
        reconciler: {
            reconcileLiveActivity: vi.fn(async () => undefined),
        },
        analytics: {
            track: vi.fn(),
        },
    };
};

const register = (
    service: MobilePushNotificationService,
    overrides: Partial<Parameters<typeof service.registerLiveActivity>[0]> = {},
) =>
    service.registerLiveActivity({
        user: { userUuid, organizationUuid },
        projectUuid,
        agentUuid,
        threadUuid,
        liveActivityUuid,
        installationUuid,
        promptUuid,
        pushToken: 'activity-token',
        ...overrides,
    });

describe('MobilePushNotificationService.registerLiveActivity', () => {
    it('registers an activity for the exact owned installation and prompt chain', async () => {
        const dependencies = createDependencies();
        const service = new MobilePushNotificationService(dependencies);

        await register(service);

        expect(
            dependencies.mobilePushNotificationStore.upsertLiveActivity,
        ).toHaveBeenCalledWith({
            liveActivityUuid,
            mobilePushInstallationUuid: installationUuid,
            organizationUuid,
            userUuid,
            projectUuid,
            agentUuid,
            threadUuid,
            promptUuid,
            pushToken: 'activity-token',
        });
        expect(
            dependencies.scheduler.mobilePushLiveActivity,
        ).toHaveBeenCalledWith({
            liveActivityUuid,
            organizationUuid,
            projectUuid,
            userUuid,
        });
        expect(dependencies.analytics.track).toHaveBeenCalledWith({
            event: 'mobile_push.live_activity_registered',
            userId: userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                agentId: agentUuid,
                threadId: threadUuid,
                promptId: promptUuid,
                installationId: installationUuid,
                liveActivityId: liveActivityUuid,
                environment: 'sandbox',
            },
        });
        expect(
            JSON.stringify(dependencies.analytics.track.mock.calls),
        ).not.toContain('activity-token');
    });

    it('denies an installation registered to another user', async () => {
        const dependencies = createDependencies();
        dependencies.mobilePushNotificationStore.findInstallation.mockResolvedValue(
            { ...installation, userUuid: 'another-user' },
        );
        const service = new MobilePushNotificationService(dependencies);

        await expect(register(service)).rejects.toBeInstanceOf(NotFoundError);
        expect(
            dependencies.mobilePushNotificationStore.upsertLiveActivity,
        ).not.toHaveBeenCalled();
    });

    it('denies replacing an existing activity owned by another user', async () => {
        const dependencies = createDependencies();
        dependencies.mobilePushNotificationStore.findLiveActivityOwner.mockResolvedValue(
            {
                liveActivityUuid,
                mobilePushInstallationUuid: installationUuid,
                organizationUuid,
                userUuid: 'another-user',
                projectUuid,
                agentUuid,
                threadUuid,
                promptUuid,
            },
        );
        const service = new MobilePushNotificationService(dependencies);

        await expect(register(service)).rejects.toBeInstanceOf(NotFoundError);
        expect(
            dependencies.mobilePushNotificationStore.upsertLiveActivity,
        ).not.toHaveBeenCalled();
    });

    it('denies an installation registered to another organization', async () => {
        const dependencies = createDependencies();
        dependencies.mobilePushNotificationStore.findInstallation.mockResolvedValue(
            { ...installation, organizationUuid: 'another-organization' },
        );
        const service = new MobilePushNotificationService(dependencies);

        await expect(register(service)).rejects.toBeInstanceOf(NotFoundError);
        expect(
            dependencies.mobilePushNotificationStore.upsertLiveActivity,
        ).not.toHaveBeenCalled();
    });

    it('denies a thread owned by another user', async () => {
        const dependencies = createDependencies();
        dependencies.threadStore.findThreadOwnership.mockResolvedValue({
            ...threadOwnership,
            ownerUserUuid: 'another-user',
        });
        const service = new MobilePushNotificationService(dependencies);

        await expect(register(service)).rejects.toBeInstanceOf(NotFoundError);
        expect(
            dependencies.mobilePushNotificationStore.upsertLiveActivity,
        ).not.toHaveBeenCalled();
    });

    it('denies a thread from another organization', async () => {
        const dependencies = createDependencies();
        dependencies.threadStore.findThreadOwnership.mockResolvedValue(
            undefined,
        );
        const service = new MobilePushNotificationService(dependencies);

        await expect(register(service)).rejects.toBeInstanceOf(NotFoundError);
        expect(
            dependencies.mobilePushNotificationStore.upsertLiveActivity,
        ).not.toHaveBeenCalled();
    });

    it('denies a thread from another project', async () => {
        const dependencies = createDependencies();
        dependencies.threadStore.findThreadOwnership.mockResolvedValue({
            ...threadOwnership,
            projectUuid: 'another-project',
        });
        const service = new MobilePushNotificationService(dependencies);

        await expect(register(service)).rejects.toBeInstanceOf(NotFoundError);
        expect(
            dependencies.mobilePushNotificationStore.upsertLiveActivity,
        ).not.toHaveBeenCalled();
    });

    it('denies a thread from another agent', async () => {
        const dependencies = createDependencies();
        dependencies.threadStore.findThreadOwnership.mockResolvedValue({
            ...threadOwnership,
            agentUuid: 'another-agent',
        });
        const service = new MobilePushNotificationService(dependencies);

        await expect(register(service)).rejects.toBeInstanceOf(NotFoundError);
        expect(
            dependencies.mobilePushNotificationStore.upsertLiveActivity,
        ).not.toHaveBeenCalled();
    });

    it('denies a prompt from another thread', async () => {
        const dependencies = createDependencies();
        dependencies.threadStore.findWebAppPrompt.mockResolvedValue({
            ...prompt,
            threadUuid: 'another-thread',
        });
        const service = new MobilePushNotificationService(dependencies);

        await expect(register(service)).rejects.toBeInstanceOf(NotFoundError);
        expect(
            dependencies.mobilePushNotificationStore.upsertLiveActivity,
        ).not.toHaveBeenCalled();
    });

    it.each(['', 'x'.repeat(4097)])(
        'rejects an invalid Live Activity token before ownership lookup',
        async (pushToken) => {
            const dependencies = createDependencies();
            const service = new MobilePushNotificationService(dependencies);

            await expect(
                register(service, { pushToken }),
            ).rejects.toBeInstanceOf(ParameterError);
            expect(
                dependencies.threadStore.findThreadOwnership,
            ).not.toHaveBeenCalled();
            expect(
                dependencies.mobilePushNotificationStore.upsertLiveActivity,
            ).not.toHaveBeenCalled();
        },
    );
});

describe('MobilePushNotificationService reconciliation scheduling', () => {
    it('enqueues every active activity for a changed thread', async () => {
        const dependencies = createDependencies();
        dependencies.mobilePushNotificationStore.findActiveLiveActivitiesForThread.mockResolvedValue(
            [
                {
                    liveActivityUuid,
                    organizationUuid,
                    projectUuid,
                    userUuid,
                },
            ],
        );
        const service = new MobilePushNotificationService(dependencies);

        await service.enqueueThreadReconciliation(threadUuid);

        expect(
            dependencies.scheduler.mobilePushLiveActivity,
        ).toHaveBeenCalledWith({
            liveActivityUuid,
            organizationUuid,
            projectUuid,
            userUuid,
        });
    });

    it('delegates a worker job to the canonical reconciler', async () => {
        const dependencies = createDependencies();
        const service = new MobilePushNotificationService(dependencies);

        await service.reconcileLiveActivity(liveActivityUuid);

        expect(
            dependencies.reconciler.reconcileLiveActivity,
        ).toHaveBeenCalledWith(liveActivityUuid);
    });
});

describe('MobilePushNotificationService installation lifecycle', () => {
    it('reports only availability and configured environments', () => {
        const service = new MobilePushNotificationService(createDependencies());

        expect(service.getStatus()).toEqual({
            enabled: true,
            environments: ['sandbox'],
        });
    });

    it('registers a rotating device token for the current account', async () => {
        const dependencies = createDependencies();
        const service = new MobilePushNotificationService(dependencies);

        await service.registerInstallation({
            user: { userUuid, organizationUuid },
            installationUuid,
            environment: 'sandbox',
            deviceToken: 'device-token',
        });

        expect(
            dependencies.mobilePushNotificationStore.upsertInstallation,
        ).toHaveBeenCalledWith({
            installationUuid,
            organizationUuid,
            userUuid,
            environment: 'sandbox',
            deviceToken: 'device-token',
        });
        expect(dependencies.analytics.track).toHaveBeenCalledWith({
            event: 'mobile_push.installation_registered',
            userId: userUuid,
            properties: {
                organizationId: organizationUuid,
                installationId: installationUuid,
                environment: 'sandbox',
            },
        });
        expect(
            JSON.stringify(dependencies.analytics.track.mock.calls),
        ).not.toContain('device-token');
    });

    it.each(['', 'x'.repeat(4097)])(
        'rejects an invalid device token before storage',
        async (deviceToken) => {
            const dependencies = createDependencies();
            const service = new MobilePushNotificationService(dependencies);

            await expect(
                service.registerInstallation({
                    user: { userUuid, organizationUuid },
                    installationUuid,
                    environment: 'sandbox',
                    deviceToken,
                }),
            ).rejects.toBeInstanceOf(ParameterError);
            expect(
                dependencies.mobilePushNotificationStore.upsertInstallation,
            ).not.toHaveBeenCalled();
        },
    );

    it('does not retain a token when mobile push is unavailable', async () => {
        const dependencies = createDependencies();
        dependencies.mobilePushNotificationsConfig.enabled = false;
        const service = new MobilePushNotificationService(dependencies);

        await service.registerInstallation({
            user: { userUuid, organizationUuid },
            installationUuid,
            environment: 'sandbox',
            deviceToken: 'device-token',
        });

        expect(
            dependencies.mobilePushNotificationStore.upsertInstallation,
        ).not.toHaveBeenCalled();
    });

    it('revokes only the current account installation on sign-out', async () => {
        const dependencies = createDependencies();
        const service = new MobilePushNotificationService(dependencies);

        await service.revokeInstallation({
            user: { userUuid, organizationUuid },
            installationUuid,
        });

        expect(
            dependencies.mobilePushNotificationStore.deleteInstallation,
        ).toHaveBeenCalledWith({
            installationUuid,
            organizationUuid,
            userUuid,
        });
    });

    it('revokes only the current account activity tuple', async () => {
        const dependencies = createDependencies();
        const service = new MobilePushNotificationService(dependencies);

        await service.revokeLiveActivity({
            user: { userUuid, organizationUuid },
            installationUuid,
            projectUuid,
            agentUuid,
            threadUuid,
            liveActivityUuid,
        });

        expect(
            dependencies.mobilePushNotificationStore.deleteLiveActivity,
        ).toHaveBeenCalledWith({
            installationUuid,
            organizationUuid,
            userUuid,
            projectUuid,
            agentUuid,
            threadUuid,
            liveActivityUuid,
        });
    });
});
