import { NotFoundError, ParameterError } from '@lightdash/common';
import { type ApnsClient } from '../../../clients/Apns/ApnsClient';
import { type MobilePushNotificationsConfig } from '../../../config/parseConfig';
import {
    MobilePushNotificationService,
    type MobilePushNotificationStore,
    type MobilePushProjectStore,
    type MobilePushThreadStore,
} from './MobilePushNotificationService';

const organizationUuid = '00000000-0000-0000-0000-000000000001';
const userUuid = '00000000-0000-0000-0000-000000000002';
const installationUuid = '00000000-0000-0000-0000-000000000003';
const validOriginUuid = '10000000-0000-4000-8000-000000000003';
const projectUuid = '00000000-0000-0000-0000-000000000004';
const agentUuid = '00000000-0000-0000-0000-000000000005';
const threadUuid = '00000000-0000-0000-0000-000000000006';
const promptUuid = '00000000-0000-0000-0000-000000000007';
const liveActivityUuid = '00000000-0000-0000-0000-000000000008';
const liveActivityStartAttemptUuid = '00000000-0000-0000-0000-000000000009';
const liveActivityPushToken =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const pushToStartToken =
    'ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789';
const validDeviceToken =
    'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
const androidRegistrationToken =
    'fMEQ_p9nS0m:APA91bH-lightdash.mobile_registration-token';

const installation = {
    mobilePushInstallationUuid: installationUuid,
    installationUuid,
    organizationUuid,
    userUuid,
    platform: 'ios' as const,
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

const agent = {
    uuid: agentUuid,
    organizationUuid,
    projectUuid,
    name: 'Mobile Demo Agent',
};

const prompt = {
    organizationUuid,
    projectUuid,
    promptUuid,
    threadUuid,
    agentUuid,
    createdByUserUuid: userUuid,
    prompt: 'How many people used Chrome last month?',
};

const claimedStartAttempt = {
    liveActivityStartAttemptUuid,
    liveActivityUuid,
    installationUuid,
    organizationUuid,
    userUuid,
    promptUuid,
    environment: 'sandbox' as const,
    pushToStartToken: 'push-to-start-token',
    pushToStartTokenFingerprint: 'token-fingerprint',
    status: 'processing' as const,
    attemptCount: 1,
};

const createDependencies = () => {
    const mobilePushNotificationStore = {
        findInstallation: vi.fn<
            MobilePushNotificationStore['findInstallation']
        >(async () => installation),
        findLiveActivityOwner: vi.fn<
            MobilePushNotificationStore['findLiveActivityOwner']
        >(async () => undefined),
        upsertInstallation: vi.fn<
            MobilePushNotificationStore['upsertInstallation']
        >(async () => ({ status: 'stored', installation })),
        registerPushToStartToken: vi.fn<
            MobilePushNotificationStore['registerPushToStartToken']
        >(async () => true),
        clearPushToStartTokenIfFingerprintMatches: vi.fn<
            MobilePushNotificationStore['clearPushToStartTokenIfFingerprintMatches']
        >(async () => true),
        createLiveActivityStartAttempts: vi.fn<
            MobilePushNotificationStore['createLiveActivityStartAttempts']
        >(async () => []),
        claimLiveActivityStartAttempt: vi.fn<
            MobilePushNotificationStore['claimLiveActivityStartAttempt']
        >(async () => undefined),
        markLiveActivityStartAttempt: vi.fn<
            MobilePushNotificationStore['markLiveActivityStartAttempt']
        >(async () => true),
        findLiveActivityStartAttemptsDue: vi.fn<
            MobilePushNotificationStore['findLiveActivityStartAttemptsDue']
        >(async () => []),
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
        getAgent: vi.fn<MobilePushThreadStore['getAgent']>(async () => agent),
        findThreadOwnership: vi.fn<
            MobilePushThreadStore['findThreadOwnership']
        >(async () => threadOwnership),
        findWebAppPrompt: vi.fn<MobilePushThreadStore['findWebAppPrompt']>(
            async () => prompt,
        ),
    } satisfies MobilePushThreadStore;
    const projectStore = {
        getSummary: vi.fn<MobilePushProjectStore['getSummary']>(async () => ({
            projectUuid,
            organizationUuid,
        })),
    } satisfies MobilePushProjectStore;

    const mobilePushNotificationsConfig: MobilePushNotificationsConfig = {
        enabled: true,
        bundleId: 'com.lightdash.mobile',
        teamId: 'TEAMID',
        sandbox: { keyId: 'KEYID', privateKey: 'private-key' },
        production: undefined,
        fcm: undefined,
    };

    return {
        mobilePushNotificationStore,
        threadStore,
        projectStore,
        mobilePushNotificationsConfig,
        scheduler: {
            mobilePushLiveActivityStart: vi.fn(async () => ({
                jobId: 'start-job-uuid',
            })),
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
        apnsClient: {
            sendLiveActivityStart: vi.fn<ApnsClient['sendLiveActivityStart']>(
                async () => ({ status: 'sent' }),
            ),
        },
        now: vi.fn(() => new Date('2026-08-31T12:00:00.000Z')),
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
        pushToken: liveActivityPushToken,
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
            pushToken: liveActivityPushToken,
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
                platform: 'ios',
                environment: 'sandbox',
            },
        });
        expect(
            JSON.stringify(dependencies.analytics.track.mock.calls),
        ).not.toContain(liveActivityPushToken);
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

    it('registers an activity for an android installation', async () => {
        const dependencies = createDependencies();
        dependencies.mobilePushNotificationStore.findInstallation.mockResolvedValue(
            { ...installation, platform: 'android', environment: 'production' },
        );
        const service = new MobilePushNotificationService(dependencies);

        await register(service, { pushToken: androidRegistrationToken });

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
            pushToken: androidRegistrationToken,
        });
        expect(dependencies.analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'mobile_push.live_activity_registered',
                properties: expect.objectContaining({ platform: 'android' }),
            }),
        );
        expect(
            dependencies.scheduler.mobilePushLiveActivity,
        ).toHaveBeenCalledWith({
            liveActivityUuid,
            organizationUuid,
            projectUuid,
            userUuid,
        });
    });

    it.each(['', 'has spaces', 'a'.repeat(4097)])(
        'rejects an invalid android registration token',
        async (pushToken) => {
            const dependencies = createDependencies();
            dependencies.mobilePushNotificationStore.findInstallation.mockResolvedValue(
                {
                    ...installation,
                    platform: 'android',
                    environment: 'production',
                },
            );
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

    it('still rejects an android registration token on an ios installation', async () => {
        const dependencies = createDependencies();
        const service = new MobilePushNotificationService(dependencies);

        await expect(
            register(service, { pushToken: androidRegistrationToken }),
        ).rejects.toBeInstanceOf(ParameterError);
        expect(
            dependencies.mobilePushNotificationStore.upsertLiveActivity,
        ).not.toHaveBeenCalled();
    });

    it.each(['', 'aa/bb', 'a'.repeat(513)])(
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

describe('MobilePushNotificationService.registerPushToStartToken', () => {
    it('rotates the token only on the exact owned installation', async () => {
        const dependencies = createDependencies();
        const service = new MobilePushNotificationService(dependencies);

        await service.registerPushToStartToken({
            user: { userUuid, organizationUuid },
            installationUuid,
            pushToken: pushToStartToken,
        });

        expect(
            dependencies.mobilePushNotificationStore.registerPushToStartToken,
        ).toHaveBeenCalledWith({
            installationUuid,
            organizationUuid,
            userUuid,
            environment: 'sandbox',
            pushToken: pushToStartToken,
        });
        expect(
            JSON.stringify(dependencies.analytics.track.mock.calls),
        ).not.toContain(pushToStartToken);
    });

    it.each([
        { ...installation, userUuid: 'foreign-user' },
        { ...installation, organizationUuid: 'foreign-organization' },
        undefined,
    ])('denies a foreign or stale installation', async (foundInstallation) => {
        const dependencies = createDependencies();
        dependencies.mobilePushNotificationStore.findInstallation.mockResolvedValue(
            foundInstallation,
        );
        const service = new MobilePushNotificationService(dependencies);

        await expect(
            service.registerPushToStartToken({
                user: { userUuid, organizationUuid },
                installationUuid,
                pushToken: pushToStartToken,
            }),
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(
            dependencies.mobilePushNotificationStore.registerPushToStartToken,
        ).not.toHaveBeenCalled();
    });

    it('returns unavailable for an unconfigured environment', async () => {
        const dependencies = createDependencies();
        dependencies.mobilePushNotificationsConfig.sandbox = undefined;
        const service = new MobilePushNotificationService(dependencies);

        await expect(
            service.registerPushToStartToken({
                user: { userUuid, organizationUuid },
                installationUuid,
                pushToken: pushToStartToken,
            }),
        ).rejects.toBeInstanceOf(NotFoundError);

        expect(
            dependencies.mobilePushNotificationStore.registerPushToStartToken,
        ).not.toHaveBeenCalled();
    });

    it.each(['', 'aa/bb', 'a'.repeat(513)])(
        'rejects an invalid token before installation lookup or storage',
        async (pushToken) => {
            const dependencies = createDependencies();
            const service = new MobilePushNotificationService(dependencies);

            await expect(
                service.registerPushToStartToken({
                    user: { userUuid, organizationUuid },
                    installationUuid,
                    pushToken,
                }),
            ).rejects.toBeInstanceOf(ParameterError);
            expect(
                dependencies.mobilePushNotificationStore.findInstallation,
            ).not.toHaveBeenCalled();
            expect(
                dependencies.mobilePushNotificationStore
                    .registerPushToStartToken,
            ).not.toHaveBeenCalled();
        },
    );

    it('returns unavailable when mobile push is disabled', async () => {
        const dependencies = createDependencies();
        dependencies.mobilePushNotificationsConfig.enabled = false;
        const service = new MobilePushNotificationService(dependencies);

        await expect(
            service.registerPushToStartToken({
                user: { userUuid, organizationUuid },
                installationUuid,
                pushToken: 'push-to-start-token',
            }),
        ).rejects.toBeInstanceOf(NotFoundError);

        expect(
            dependencies.mobilePushNotificationStore.findInstallation,
        ).not.toHaveBeenCalled();
        expect(
            dependencies.mobilePushNotificationStore.registerPushToStartToken,
        ).not.toHaveBeenCalled();
    });

    it('returns unavailable when ownership changes during registration', async () => {
        const dependencies = createDependencies();
        dependencies.mobilePushNotificationStore.registerPushToStartToken.mockResolvedValue(
            false,
        );
        const service = new MobilePushNotificationService(dependencies);

        await expect(
            service.registerPushToStartToken({
                user: { userUuid, organizationUuid },
                installationUuid,
                pushToken: pushToStartToken,
            }),
        ).rejects.toBeInstanceOf(NotFoundError);
    });
});

describe('MobilePushNotificationService.startLiveActivitiesForPrompt', () => {
    const start = (
        service: MobilePushNotificationService,
        originatingInstallationUuid?: string,
    ) =>
        service.startLiveActivitiesForPrompt({
            user: { userUuid, organizationUuid },
            projectUuid,
            agentUuid,
            threadUuid,
            promptUuid,
            originatingInstallationUuid,
        });

    it('starts every browser device in deterministic model order', async () => {
        const dependencies = createDependencies();
        dependencies.mobilePushNotificationStore.createLiveActivityStartAttempts.mockResolvedValue(
            [
                {
                    liveActivityStartAttemptUuid: 'attempt-a',
                    installationUuid: 'installation-a',
                },
                {
                    liveActivityStartAttemptUuid: 'attempt-b',
                    installationUuid: 'installation-b',
                },
            ],
        );
        const service = new MobilePushNotificationService(dependencies);

        await start(service);

        expect(
            dependencies.mobilePushNotificationStore
                .createLiveActivityStartAttempts,
        ).toHaveBeenCalledWith({
            organizationUuid,
            userUuid,
            promptUuid,
            excludedMobilePushInstallationUuid: null,
            environments: ['sandbox'],
        });
        expect(
            dependencies.scheduler.mobilePushLiveActivityStart,
        ).toHaveBeenNthCalledWith(1, {
            liveActivityStartAttemptUuid: 'attempt-a',
            organizationUuid,
            projectUuid,
            userUuid,
        });
        expect(
            dependencies.scheduler.mobilePushLiveActivityStart,
        ).toHaveBeenNthCalledWith(2, {
            liveActivityStartAttemptUuid: 'attempt-b',
            organizationUuid,
            projectUuid,
            userUuid,
        });
    });

    it('does not schedule an installation without a push-to-start token', async () => {
        const dependencies = createDependencies();
        const service = new MobilePushNotificationService(dependencies);

        await start(service);

        expect(
            dependencies.mobilePushNotificationStore
                .createLiveActivityStartAttempts,
        ).toHaveBeenCalled();
        expect(
            dependencies.scheduler.mobilePushLiveActivityStart,
        ).not.toHaveBeenCalled();
    });

    it('does not inspect prompts when APNs is not configured', async () => {
        const dependencies = createDependencies();
        dependencies.mobilePushNotificationsConfig.sandbox = undefined;
        const service = new MobilePushNotificationService(dependencies);

        await start(service);

        expect(dependencies.projectStore.getSummary).not.toHaveBeenCalled();
        expect(
            dependencies.mobilePushNotificationStore
                .createLiveActivityStartAttempts,
        ).not.toHaveBeenCalled();
    });

    it('does not inspect prompts when mobile push is disabled', async () => {
        const dependencies = createDependencies();
        dependencies.mobilePushNotificationsConfig.enabled = false;
        const service = new MobilePushNotificationService(dependencies);

        await start(service);

        expect(dependencies.projectStore.getSummary).not.toHaveBeenCalled();
        expect(
            dependencies.mobilePushNotificationStore
                .createLiveActivityStartAttempts,
        ).not.toHaveBeenCalled();
    });

    it('keeps a durable excluded origin and starts every other device', async () => {
        const dependencies = createDependencies();
        dependencies.mobilePushNotificationStore.findInstallation.mockResolvedValue(
            {
                ...installation,
                mobilePushInstallationUuid: 'origin-internal-uuid',
            },
        );
        dependencies.mobilePushNotificationStore.createLiveActivityStartAttempts.mockResolvedValue(
            [
                {
                    liveActivityStartAttemptUuid: 'other-attempt',
                    installationUuid: 'other-installation',
                },
            ],
        );
        const service = new MobilePushNotificationService(dependencies);

        await start(service, validOriginUuid);

        expect(
            dependencies.mobilePushNotificationStore
                .createLiveActivityStartAttempts,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                excludedMobilePushInstallationUuid: 'origin-internal-uuid',
            }),
        );
        expect(
            dependencies.scheduler.mobilePushLiveActivityStart,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                liveActivityStartAttemptUuid: 'other-attempt',
            }),
        );
    });

    it('ignores an invalid origin UUID without excluding a device', async () => {
        const dependencies = createDependencies();
        const service = new MobilePushNotificationService(dependencies);

        await start(service, 'not-a-uuid');

        expect(
            dependencies.mobilePushNotificationStore.findInstallation,
        ).not.toHaveBeenCalled();
        expect(
            dependencies.mobilePushNotificationStore
                .createLiveActivityStartAttempts,
        ).toHaveBeenCalledWith(
            expect.objectContaining({
                excludedMobilePushInstallationUuid: null,
            }),
        );
    });

    it.each([
        ['deleted', undefined],
        ['foreign', { ...installation, userUuid: 'foreign-user' }],
        [
            'transferred',
            {
                ...installation,
                organizationUuid: 'new-organization',
                userUuid: 'new-user',
            },
        ],
    ])(
        'ignores a %s origin without excluding another owned device',
        async (_name, foundInstallation) => {
            const dependencies = createDependencies();
            dependencies.mobilePushNotificationStore.findInstallation.mockResolvedValue(
                foundInstallation,
            );
            const service = new MobilePushNotificationService(dependencies);

            await start(service, validOriginUuid);

            expect(
                dependencies.mobilePushNotificationStore.findInstallation,
            ).toHaveBeenCalledWith(validOriginUuid);
            expect(
                dependencies.mobilePushNotificationStore
                    .createLiveActivityStartAttempts,
            ).toHaveBeenCalledWith(
                expect.objectContaining({
                    excludedMobilePushInstallationUuid: null,
                }),
            );
        },
    );

    it.each([
        ['project organization', 'projectStore'],
        ['agent project', 'agent'],
        ['thread agent', 'thread'],
        ['prompt user', 'prompt'],
    ] as const)(
        'does not create attempts when the %s ownership fact mismatches',
        async (_name, mismatch) => {
            const dependencies = createDependencies();
            if (mismatch === 'projectStore') {
                dependencies.projectStore.getSummary.mockResolvedValue({
                    projectUuid,
                    organizationUuid: 'foreign-organization',
                });
            }
            if (mismatch === 'agent') {
                dependencies.threadStore.getAgent.mockResolvedValue({
                    uuid: agentUuid,
                    organizationUuid,
                    projectUuid: 'foreign-project',
                    name: 'Mobile Demo Agent',
                });
            }
            if (mismatch === 'thread') {
                dependencies.threadStore.findThreadOwnership.mockResolvedValue({
                    ...threadOwnership,
                    agentUuid: 'foreign-agent',
                });
            }
            if (mismatch === 'prompt') {
                dependencies.threadStore.findWebAppPrompt.mockResolvedValue({
                    ...prompt,
                    createdByUserUuid: 'foreign-user',
                });
            }
            const service = new MobilePushNotificationService(dependencies);

            await start(service);

            expect(
                dependencies.mobilePushNotificationStore
                    .createLiveActivityStartAttempts,
            ).not.toHaveBeenCalled();
        },
    );
});

describe('MobilePushNotificationService.deliverLiveActivityStart', () => {
    it('allows only one concurrent claim to send to APNs', async () => {
        const dependencies = createDependencies();
        let status: 'pending' | 'processing' | 'sent' = 'pending';
        dependencies.mobilePushNotificationStore.claimLiveActivityStartAttempt.mockImplementation(
            async () => {
                if (status !== 'pending') return undefined;
                status = 'processing';
                return claimedStartAttempt;
            },
        );
        dependencies.mobilePushNotificationStore.markLiveActivityStartAttempt.mockImplementation(
            async ({ status: nextStatus }) => {
                if (status !== 'processing') return false;
                status = nextStatus === 'sent' ? 'sent' : status;
                return true;
            },
        );
        const service = new MobilePushNotificationService(dependencies);

        await Promise.all([
            service.deliverLiveActivityStart(liveActivityStartAttemptUuid),
            service.deliverLiveActivityStart(liveActivityStartAttemptUuid),
        ]);

        expect(
            dependencies.apnsClient.sendLiveActivityStart,
        ).toHaveBeenCalledTimes(1);
        expect(
            dependencies.mobilePushNotificationStore
                .markLiveActivityStartAttempt,
        ).toHaveBeenCalledWith({
            liveActivityStartAttemptUuid,
            status: 'sent',
            pushTokenFingerprint: 'token-fingerprint',
            completedAt: new Date('2026-08-31T12:00:00.000Z'),
        });
    });

    it('sends the exact owned prompt identifiers and five-minute stale date', async () => {
        const dependencies = createDependencies();
        dependencies.mobilePushNotificationStore.claimLiveActivityStartAttempt.mockResolvedValue(
            claimedStartAttempt,
        );
        const service = new MobilePushNotificationService(dependencies);

        await service.deliverLiveActivityStart(liveActivityStartAttemptUuid);

        expect(
            dependencies.apnsClient.sendLiveActivityStart,
        ).toHaveBeenCalledWith({
            environment: 'sandbox',
            pushToStartToken: 'push-to-start-token',
            liveActivityUuid,
            payload: {
                aps: {
                    timestamp: 1788177600,
                    event: 'start',
                    'content-state': {
                        state: 'working',
                        projectUuid,
                        agentUuid,
                        threadUuid,
                        promptUuid,
                    },
                    'stale-date': 1788177900,
                    'attributes-type': 'AgentRunActivityAttributes',
                    attributes: {
                        liveActivityUuid,
                        installationUuid,
                        projectUuid,
                        agentUuid,
                        threadUuid,
                        promptUuid,
                        agentName: 'Mobile Demo Agent',
                        taskSummary: 'How many people used Chrome last month?',
                    },
                    'input-push-token': 1,
                    alert: {
                        title: 'Lightdash',
                        body: 'Your agent is running.',
                    },
                },
            },
        });
    });

    it('retries a transient APNs failure with the stable activity identity', async () => {
        const dependencies = createDependencies();
        dependencies.mobilePushNotificationStore.claimLiveActivityStartAttempt
            .mockResolvedValueOnce(claimedStartAttempt)
            .mockResolvedValueOnce({
                ...claimedStartAttempt,
                pushToStartToken: 'rotated-push-to-start-token',
                pushToStartTokenFingerprint: 'rotated-fingerprint',
                attemptCount: 2,
            });
        dependencies.apnsClient.sendLiveActivityStart
            .mockResolvedValueOnce({
                status: 'retryable',
                reason: 'TooManyRequests',
            })
            .mockResolvedValueOnce({ status: 'sent' });
        const service = new MobilePushNotificationService(dependencies);

        await expect(
            service.deliverLiveActivityStart(liveActivityStartAttemptUuid),
        ).rejects.toThrow('retryable');
        await service.deliverLiveActivityStart(liveActivityStartAttemptUuid);

        expect(
            dependencies.apnsClient.sendLiveActivityStart.mock.calls.map(
                ([args]) => args.liveActivityUuid,
            ),
        ).toEqual([liveActivityUuid, liveActivityUuid]);
        expect(
            dependencies.mobilePushNotificationStore
                .markLiveActivityStartAttempt,
        ).toHaveBeenNthCalledWith(1, {
            liveActivityStartAttemptUuid,
            status: 'retryable',
            pushTokenFingerprint: 'token-fingerprint',
            completedAt: null,
        });
        expect(
            dependencies.mobilePushNotificationStore
                .markLiveActivityStartAttempt,
        ).toHaveBeenNthCalledWith(2, {
            liveActivityStartAttemptUuid,
            status: 'sent',
            pushTokenFingerprint: 'rotated-fingerprint',
            completedAt: new Date('2026-08-31T12:00:00.000Z'),
        });
    });

    it('stops retrying at the explicit max-attempt policy', async () => {
        const dependencies = createDependencies();
        dependencies.mobilePushNotificationStore.claimLiveActivityStartAttempt.mockResolvedValue(
            { ...claimedStartAttempt, attemptCount: 5 },
        );
        dependencies.apnsClient.sendLiveActivityStart.mockResolvedValue({
            status: 'retryable',
            reason: 'ServiceUnavailable',
        });
        const service = new MobilePushNotificationService(dependencies);

        await service.deliverLiveActivityStart(liveActivityStartAttemptUuid);

        expect(
            dependencies.mobilePushNotificationStore
                .markLiveActivityStartAttempt,
        ).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
    });

    it('does not reopen a sent attempt on later reconciliation', async () => {
        const dependencies = createDependencies();
        let status: 'pending' | 'processing' | 'sent' = 'pending';
        dependencies.mobilePushNotificationStore.claimLiveActivityStartAttempt.mockImplementation(
            async () => {
                if (status !== 'pending') return undefined;
                status = 'processing';
                return claimedStartAttempt;
            },
        );
        dependencies.mobilePushNotificationStore.markLiveActivityStartAttempt.mockImplementation(
            async ({ status: nextStatus }) => {
                if (status !== 'processing') return false;
                status = nextStatus === 'sent' ? 'sent' : status;
                return true;
            },
        );
        const service = new MobilePushNotificationService(dependencies);

        await service.deliverLiveActivityStart(liveActivityStartAttemptUuid);
        await service.deliverLiveActivityStart(liveActivityStartAttemptUuid);

        expect(
            dependencies.apnsClient.sendLiveActivityStart,
        ).toHaveBeenCalledTimes(1);
        expect(
            dependencies.mobilePushNotificationStore
                .markLiveActivityStartAttempt,
        ).toHaveBeenCalledTimes(1);
    });

    it('clears an invalid token only when the attempted fingerprint still matches', async () => {
        const dependencies = createDependencies();
        dependencies.mobilePushNotificationStore.claimLiveActivityStartAttempt.mockResolvedValue(
            claimedStartAttempt,
        );
        dependencies.apnsClient.sendLiveActivityStart.mockResolvedValue({
            status: 'invalid_token',
            reason: 'BadDeviceToken',
        });
        const service = new MobilePushNotificationService(dependencies);

        await service.deliverLiveActivityStart(liveActivityStartAttemptUuid);

        expect(
            dependencies.mobilePushNotificationStore
                .clearPushToStartTokenIfFingerprintMatches,
        ).toHaveBeenCalledWith({
            installationUuid,
            organizationUuid,
            userUuid,
            pushTokenFingerprint: 'token-fingerprint',
        });
        expect(
            dependencies.mobilePushNotificationStore
                .markLiveActivityStartAttempt,
        ).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
    });

    it('preserves a concurrently rotated token and retries with its fingerprint', async () => {
        const dependencies = createDependencies();
        dependencies.mobilePushNotificationStore.claimLiveActivityStartAttempt.mockResolvedValue(
            claimedStartAttempt,
        );
        dependencies.apnsClient.sendLiveActivityStart.mockResolvedValue({
            status: 'invalid_token',
            reason: 'Unregistered',
        });
        dependencies.mobilePushNotificationStore.clearPushToStartTokenIfFingerprintMatches.mockResolvedValue(
            false,
        );
        const service = new MobilePushNotificationService(dependencies);

        await expect(
            service.deliverLiveActivityStart(liveActivityStartAttemptUuid),
        ).rejects.toThrow('rotated during delivery');

        expect(
            dependencies.mobilePushNotificationStore
                .markLiveActivityStartAttempt,
        ).toHaveBeenCalledWith({
            liveActivityStartAttemptUuid,
            status: 'retryable',
            pushTokenFingerprint: 'token-fingerprint',
            completedAt: null,
        });
    });

    it('revalidates ownership after the atomic claim', async () => {
        const dependencies = createDependencies();
        dependencies.mobilePushNotificationStore.claimLiveActivityStartAttempt.mockResolvedValue(
            claimedStartAttempt,
        );
        dependencies.threadStore.findWebAppPrompt.mockResolvedValue({
            ...prompt,
            createdByUserUuid: 'foreign-user',
        });
        const service = new MobilePushNotificationService(dependencies);

        await service.deliverLiveActivityStart(liveActivityStartAttemptUuid);

        expect(
            dependencies.apnsClient.sendLiveActivityStart,
        ).not.toHaveBeenCalled();
        expect(
            dependencies.mobilePushNotificationStore
                .markLiveActivityStartAttempt,
        ).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
    });
});

describe('MobilePushNotificationService reconciliation scheduling', () => {
    it.each(['query', 'scheduler'] as const)(
        'enqueues existing reconciliations before a start-attempt %s failure',
        async (failurePoint) => {
            const dependencies = createDependencies();
            dependencies.mobilePushNotificationStore.findLiveActivitiesDueForReconciliation.mockResolvedValue(
                [
                    {
                        liveActivityUuid,
                        organizationUuid,
                        projectUuid,
                        userUuid,
                    },
                ],
            );
            if (failurePoint === 'query') {
                dependencies.mobilePushNotificationStore.findLiveActivityStartAttemptsDue.mockRejectedValue(
                    new Error('start query unavailable'),
                );
            } else {
                dependencies.mobilePushNotificationStore.findLiveActivityStartAttemptsDue.mockResolvedValue(
                    [
                        {
                            liveActivityStartAttemptUuid,
                            installationUuid,
                            organizationUuid,
                            projectUuid,
                            userUuid,
                        },
                    ],
                );
                dependencies.scheduler.mobilePushLiveActivityStart.mockRejectedValue(
                    new Error('start scheduler unavailable'),
                );
            }
            const service = new MobilePushNotificationService(dependencies);

            await expect(service.sweepLiveActivities()).rejects.toThrow(
                failurePoint === 'query'
                    ? 'start query unavailable'
                    : 'start scheduler unavailable',
            );

            expect(
                dependencies.scheduler.mobilePushLiveActivity,
            ).toHaveBeenCalledWith({
                liveActivityUuid,
                organizationUuid,
                projectUuid,
                userUuid,
            });
            const startFailureCall =
                failurePoint === 'query'
                    ? dependencies.mobilePushNotificationStore
                          .findLiveActivityStartAttemptsDue
                    : dependencies.scheduler.mobilePushLiveActivityStart;
            expect(
                dependencies.scheduler.mobilePushLiveActivity.mock
                    .invocationCallOrder[0],
            ).toBeLessThan(startFailureCall.mock.invocationCallOrder[0]);
        },
    );

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
            platforms: ['ios'],
        });
    });

    it('registers a rotating device token for the current account', async () => {
        const dependencies = createDependencies();
        const service = new MobilePushNotificationService(dependencies);

        await service.registerInstallation({
            user: { userUuid, organizationUuid },
            installationUuid,
            platform: 'ios',
            environment: 'sandbox',
            deviceToken: validDeviceToken,
        });

        expect(
            dependencies.mobilePushNotificationStore.upsertInstallation,
        ).toHaveBeenCalledWith({
            installationUuid,
            organizationUuid,
            userUuid,
            platform: 'ios',
            environment: 'sandbox',
            deviceToken: validDeviceToken,
        });
        expect(dependencies.analytics.track).toHaveBeenCalledWith({
            event: 'mobile_push.installation_registered',
            userId: userUuid,
            properties: {
                organizationId: organizationUuid,
                installationId: installationUuid,
                platform: 'ios',
                environment: 'sandbox',
            },
        });
        expect(
            JSON.stringify(dependencies.analytics.track.mock.calls),
        ).not.toContain(validDeviceToken);
    });

    it('reports a refused reassignment as not found', async () => {
        const dependencies = createDependencies();
        dependencies.mobilePushNotificationStore.upsertInstallation.mockResolvedValue(
            { status: 'owner_mismatch' },
        );
        const service = new MobilePushNotificationService(dependencies);

        await expect(
            service.registerInstallation({
                user: { userUuid, organizationUuid },
                installationUuid,
                platform: 'ios',
                environment: 'sandbox',
                deviceToken: validDeviceToken,
            }),
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(dependencies.analytics.track).not.toHaveBeenCalled();
    });

    it('rejects an android registration when FCM is not configured', async () => {
        const dependencies = createDependencies();
        const service = new MobilePushNotificationService(dependencies);

        await expect(
            service.registerInstallation({
                user: { userUuid, organizationUuid },
                installationUuid,
                platform: 'android',
                environment: 'production',
                deviceToken: 'fcm-registration:token_value',
            }),
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(
            dependencies.mobilePushNotificationStore.upsertInstallation,
        ).not.toHaveBeenCalled();
    });

    it('registers an android installation against the FCM credential', async () => {
        const dependencies = createDependencies();
        dependencies.mobilePushNotificationsConfig.fcm = {
            projectId: 'lightdash-mobile',
            clientEmail: 'push@lightdash-mobile.iam.gserviceaccount.com',
            privateKey: 'private-key',
        };
        const service = new MobilePushNotificationService(dependencies);

        await service.registerInstallation({
            user: { userUuid, organizationUuid },
            installationUuid,
            platform: 'android',
            environment: 'production',
            deviceToken: 'fcm-registration:token_value',
        });

        expect(
            dependencies.mobilePushNotificationStore.upsertInstallation,
        ).toHaveBeenCalledWith({
            installationUuid,
            organizationUuid,
            userUuid,
            platform: 'android',
            environment: 'production',
            deviceToken: 'fcm-registration:token_value',
        });
    });

    it('reports android as available once FCM is configured', () => {
        const dependencies = createDependencies();
        dependencies.mobilePushNotificationsConfig.fcm = {
            projectId: 'lightdash-mobile',
            clientEmail: 'push@lightdash-mobile.iam.gserviceaccount.com',
            privateKey: 'private-key',
        };
        const service = new MobilePushNotificationService(dependencies);

        expect(service.getStatus().platforms).toEqual(['ios', 'android']);
    });

    it('rejects a push-to-start token on an android installation', async () => {
        const dependencies = createDependencies();
        dependencies.mobilePushNotificationStore.findInstallation.mockResolvedValue(
            { ...installation, platform: 'android' },
        );
        const service = new MobilePushNotificationService(dependencies);

        await expect(
            service.registerPushToStartToken({
                user: { userUuid, organizationUuid },
                installationUuid,
                pushToken: pushToStartToken,
            }),
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(
            dependencies.mobilePushNotificationStore.registerPushToStartToken,
        ).not.toHaveBeenCalled();
    });

    it.each(['', 'aa/bb', 'a'.repeat(513)])(
        'rejects an invalid device token before storage',
        async (deviceToken) => {
            const dependencies = createDependencies();
            const service = new MobilePushNotificationService(dependencies);

            await expect(
                service.registerInstallation({
                    user: { userUuid, organizationUuid },
                    installationUuid,
                    platform: 'ios',
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
            platform: 'ios',
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
