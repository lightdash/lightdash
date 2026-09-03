import {
    MobilePushNotificationReconciler,
    type AiAgentThreadLiveStateSignals,
    type MobilePushApnsClient,
    type MobilePushFcmClient,
    type MobilePushReconciliationStore,
    type MobilePushReconciliationThreadStore,
    type ReconciliationActivity,
} from './MobilePushNotificationReconciler';

const now = new Date('2026-08-30T12:01:00.000Z');
const activity: ReconciliationActivity = {
    liveActivityUuid: 'activity-uuid',
    mobilePushInstallationUuid: 'installation-uuid',
    installationUuid: 'public-installation-uuid',
    organizationUuid: 'organization-uuid',
    userUuid: 'user-uuid',
    projectUuid: 'project-uuid',
    agentUuid: 'agent-uuid',
    threadUuid: 'thread-uuid',
    promptUuid: 'prompt-uuid',
    platform: 'ios' as const,
    environment: 'sandbox' as const,
    deviceToken: 'device-token',
    pushToken: 'activity-token',
    lastDeliveredState: null,
    lastDeliveredStateChangedAt: null,
    staleAt: null,
    endedAt: null,
    completionAlertCompletedAt: null,
};

const workingSignals = (): AiAgentThreadLiveStateSignals => ({
    threadUuid: activity.threadUuid,
    threadCreatedAt: new Date('2026-08-30T12:00:00.000Z'),
    latestPrompt: {
        createdAt: new Date('2026-08-30T12:00:00.000Z'),
        retriedAt: null,
        respondedAt: null,
        response: null,
        errorMessage: null,
        interruptedAt: null,
        needsUserInput: null,
    },
    runSqlToolCalls: [],
    pendingWritebackCreatedAt: null,
    activeDeepResearchRun: null,
});

const createDependencies = () => {
    const notificationStore = {
        findLiveActivity: vi.fn(async () => activity),
        markLiveActivityDelivered: vi.fn(async () => undefined),
        markCompletionAlertCompleted: vi.fn(async () => undefined),
        deleteLiveActivity: vi.fn(async () => undefined),
        deleteInstallation: vi.fn(async () => undefined),
    } satisfies MobilePushReconciliationStore;
    const threadStore = {
        findThreadOwnership: vi.fn(async () => ({
            threadUuid: activity.threadUuid,
            projectUuid: activity.projectUuid,
            agentUuid: activity.agentUuid,
            ownerUserUuid: activity.userUuid,
            createdFrom: 'web_app',
            ownerIsServiceAccount: false,
        })),
        findThreadLiveStateSignals: vi.fn(async () => [workingSignals()]),
    } satisfies MobilePushReconciliationThreadStore;
    const apnsClient = {
        sendLiveActivity: vi.fn<MobilePushApnsClient['sendLiveActivity']>(
            async () => ({ status: 'sent' }),
        ),
        sendAlert: vi.fn<MobilePushApnsClient['sendAlert']>(async () => ({
            status: 'sent',
        })),
    };
    const fcmClient = {
        sendAgentRunUpdate: vi.fn<MobilePushFcmClient['sendAgentRunUpdate']>(
            async () => ({ status: 'sent' }),
        ),
        sendAgentRunAlert: vi.fn<MobilePushFcmClient['sendAgentRunAlert']>(
            async () => ({ status: 'sent' }),
        ),
    };
    const scheduler = {
        mobilePushLiveActivity: vi.fn(async () => ({ jobId: 'job-uuid' })),
    };
    const analytics = {
        track: vi.fn(),
    };
    const completionAlert: { title: string; body: string } | undefined =
        undefined;

    return {
        notificationStore,
        threadStore,
        apnsClient,
        fcmClient,
        scheduler,
        analytics,
        completionAlert,
        now: () => now,
    };
};

describe('MobilePushNotificationReconciler.reconcileLiveActivity', () => {
    it('delivers the canonical working state with a five-minute stale date', async () => {
        const dependencies = createDependencies();
        const reconciler = new MobilePushNotificationReconciler(dependencies);

        await reconciler.reconcileLiveActivity(activity.liveActivityUuid);

        expect(dependencies.apnsClient.sendLiveActivity).toHaveBeenCalledWith({
            environment: 'sandbox',
            pushToken: 'activity-token',
            payload: {
                aps: {
                    timestamp: 1788091260,
                    event: 'update',
                    'stale-date': 1788091560,
                    'content-state': {
                        state: 'working',
                        projectUuid: 'project-uuid',
                        agentUuid: 'agent-uuid',
                        threadUuid: 'thread-uuid',
                        promptUuid: 'prompt-uuid',
                    },
                },
            },
        });
        expect(
            dependencies.notificationStore.markLiveActivityDelivered,
        ).toHaveBeenCalledWith({
            liveActivityUuid: 'activity-uuid',
            state: 'working',
            stateChangedAt: new Date('2026-08-30T12:00:00.000Z'),
            staleAt: new Date('2026-08-30T12:06:00.000Z'),
            endedAt: null,
        });
        expect(
            dependencies.scheduler.mobilePushLiveActivity,
        ).toHaveBeenCalledWith(
            {
                liveActivityUuid: 'activity-uuid',
                organizationUuid: 'organization-uuid',
                projectUuid: 'project-uuid',
                userUuid: 'user-uuid',
            },
            new Date('2026-08-30T12:05:00.000Z'),
        );
        expect(dependencies.analytics.track).toHaveBeenCalledWith({
            event: 'mobile_push.live_activity_delivery',
            userId: 'user-uuid',
            properties: {
                organizationId: 'organization-uuid',
                projectId: 'project-uuid',
                agentId: 'agent-uuid',
                threadId: 'thread-uuid',
                promptId: 'prompt-uuid',
                installationId: 'public-installation-uuid',
                liveActivityId: 'activity-uuid',
                platform: 'ios',
                environment: 'sandbox',
                state: 'working',
                activityEvent: 'update',
                outcome: 'sent',
            },
        });
        expect(
            JSON.stringify(dependencies.analytics.track.mock.calls),
        ).not.toContain('activity-token');
    });

    it('ends an idle activity without a stale date and dismisses it after one minute', async () => {
        const dependencies = createDependencies();
        dependencies.threadStore.findThreadLiveStateSignals.mockResolvedValue([
            {
                ...workingSignals(),
                latestPrompt: {
                    ...workingSignals().latestPrompt!,
                    respondedAt: new Date('2026-08-30T12:00:30.000Z'),
                    response: 'stored only in the database',
                },
            },
        ]);
        const reconciler = new MobilePushNotificationReconciler(dependencies);

        await reconciler.reconcileLiveActivity(activity.liveActivityUuid);

        expect(dependencies.apnsClient.sendLiveActivity).toHaveBeenCalledWith({
            environment: 'sandbox',
            pushToken: 'activity-token',
            payload: {
                aps: {
                    timestamp: 1788091260,
                    event: 'end',
                    'dismissal-date': 1788091320,
                    'content-state': {
                        state: 'idle',
                        projectUuid: 'project-uuid',
                        agentUuid: 'agent-uuid',
                        threadUuid: 'thread-uuid',
                        promptUuid: 'prompt-uuid',
                    },
                },
            },
        });
        expect(
            dependencies.notificationStore.markLiveActivityDelivered,
        ).toHaveBeenCalledWith(
            expect.objectContaining({ state: 'idle', endedAt: now }),
        );
        expect(
            dependencies.scheduler.mobilePushLiveActivity,
        ).not.toHaveBeenCalled();
        expect(dependencies.apnsClient.sendAlert).not.toHaveBeenCalled();
    });

    it('sends configured completion copy after ending an idle activity', async () => {
        const dependencies = {
            ...createDependencies(),
            completionAlert: {
                title: 'Approved title',
                body: 'Approved body',
            },
        };
        dependencies.threadStore.findThreadLiveStateSignals.mockResolvedValue([
            {
                ...workingSignals(),
                latestPrompt: {
                    ...workingSignals().latestPrompt!,
                    respondedAt: new Date('2026-08-30T12:00:30.000Z'),
                    response: 'stored only in the database',
                },
            },
        ]);
        const reconciler = new MobilePushNotificationReconciler(dependencies);

        await reconciler.reconcileLiveActivity(activity.liveActivityUuid);

        expect(dependencies.apnsClient.sendAlert).toHaveBeenCalledWith({
            environment: 'sandbox',
            deviceToken: 'device-token',
            collapseId: 'activity-uuid',
            payload: {
                aps: {
                    alert: {
                        title: 'Approved title',
                        body: 'Approved body',
                    },
                },
                projectUuid: 'project-uuid',
                agentUuid: 'agent-uuid',
                threadUuid: 'thread-uuid',
                promptUuid: 'prompt-uuid',
            },
        });
        expect(
            dependencies.notificationStore.markCompletionAlertCompleted,
        ).toHaveBeenCalledWith('activity-uuid');
        expect(
            JSON.stringify(dependencies.analytics.track.mock.calls),
        ).not.toMatch(/Approved title|Approved body/);
    });

    it('deletes the exact installation when its device token is invalid', async () => {
        const dependencies = {
            ...createDependencies(),
            completionAlert: {
                title: 'Approved title',
                body: 'Approved body',
            },
        };
        dependencies.notificationStore.findLiveActivity.mockResolvedValue({
            ...activity,
            lastDeliveredState: 'idle',
            endedAt: now,
        });
        dependencies.apnsClient.sendAlert.mockResolvedValue({
            status: 'invalid_token',
            reason: 'BadDeviceToken',
        });
        const reconciler = new MobilePushNotificationReconciler(dependencies);

        await reconciler.reconcileLiveActivity(activity.liveActivityUuid);

        expect(
            dependencies.notificationStore.deleteInstallation,
        ).toHaveBeenCalledWith({
            installationUuid: 'public-installation-uuid',
            organizationUuid: 'organization-uuid',
            userUuid: 'user-uuid',
        });
        expect(
            dependencies.notificationStore.markCompletionAlertCompleted,
        ).not.toHaveBeenCalled();
    });

    it('retries an unfinished alert without redelivering an ended activity', async () => {
        const dependencies = {
            ...createDependencies(),
            completionAlert: {
                title: 'Approved title',
                body: 'Approved body',
            },
        };
        dependencies.notificationStore.findLiveActivity.mockResolvedValue({
            ...activity,
            lastDeliveredState: 'idle',
            endedAt: now,
        });
        dependencies.apnsClient.sendAlert.mockResolvedValue({
            status: 'retryable',
            reason: 'ServiceUnavailable',
        });
        const reconciler = new MobilePushNotificationReconciler(dependencies);

        await expect(
            reconciler.reconcileLiveActivity(activity.liveActivityUuid),
        ).rejects.toThrow('Mobile push alert delivery is retryable');

        expect(dependencies.apnsClient.sendLiveActivity).not.toHaveBeenCalled();
        expect(
            dependencies.notificationStore.markLiveActivityDelivered,
        ).not.toHaveBeenCalled();
    });

    it('still sends a completion alert when the Activity token is invalid', async () => {
        const dependencies = {
            ...createDependencies(),
            completionAlert: {
                title: 'Approved title',
                body: 'Approved body',
            },
        };
        dependencies.threadStore.findThreadLiveStateSignals.mockResolvedValue([
            {
                ...workingSignals(),
                latestPrompt: {
                    ...workingSignals().latestPrompt!,
                    respondedAt: new Date('2026-08-30T12:00:30.000Z'),
                    response: 'stored only in the database',
                },
            },
        ]);
        dependencies.apnsClient.sendLiveActivity.mockResolvedValue({
            status: 'invalid_token',
            reason: 'Unregistered',
        });
        const reconciler = new MobilePushNotificationReconciler(dependencies);

        await reconciler.reconcileLiveActivity(activity.liveActivityUuid);

        expect(dependencies.apnsClient.sendAlert).toHaveBeenCalledOnce();
        expect(
            dependencies.notificationStore.deleteLiveActivity,
        ).toHaveBeenCalledWith({ liveActivityUuid: 'activity-uuid' });
    });

    it('does not redeliver an unchanged state', async () => {
        const dependencies = createDependencies();
        dependencies.notificationStore.findLiveActivity.mockResolvedValue({
            ...activity,
            lastDeliveredState: 'working',
            staleAt: new Date('2026-08-30T12:06:00.000Z'),
        });
        const reconciler = new MobilePushNotificationReconciler(dependencies);

        await reconciler.reconcileLiveActivity(activity.liveActivityUuid);

        expect(dependencies.apnsClient.sendLiveActivity).not.toHaveBeenCalled();
    });

    it('deletes an invalid ActivityKit token without retrying', async () => {
        const dependencies = createDependencies();
        dependencies.apnsClient.sendLiveActivity.mockResolvedValue({
            status: 'invalid_token',
            reason: 'Unregistered',
        });
        const reconciler = new MobilePushNotificationReconciler(dependencies);

        await reconciler.reconcileLiveActivity(activity.liveActivityUuid);

        expect(
            dependencies.notificationStore.deleteLiveActivity,
        ).toHaveBeenCalledWith({ liveActivityUuid: 'activity-uuid' });
        expect(
            dependencies.notificationStore.markLiveActivityDelivered,
        ).not.toHaveBeenCalled();
        expect(dependencies.analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({
                properties: expect.objectContaining({
                    outcome: 'invalid_token',
                }),
            }),
        );
    });

    it('surfaces a retryable APNs failure to the job runner', async () => {
        const dependencies = createDependencies();
        dependencies.apnsClient.sendLiveActivity.mockResolvedValue({
            status: 'retryable',
            reason: 'ServiceUnavailable',
        });
        const reconciler = new MobilePushNotificationReconciler(dependencies);

        await expect(
            reconciler.reconcileLiveActivity(activity.liveActivityUuid),
        ).rejects.toThrow(
            'Mobile push delivery is retryable: ServiceUnavailable',
        );
        expect(
            dependencies.notificationStore.markLiveActivityDelivered,
        ).not.toHaveBeenCalled();
        expect(dependencies.analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({
                properties: expect.objectContaining({ outcome: 'retryable' }),
            }),
        );
    });

    it('preserves a registration after a non-token APNs rejection', async () => {
        const dependencies = createDependencies();
        dependencies.apnsClient.sendLiveActivity.mockResolvedValue({
            status: 'failed',
            reason: 'BadTopic',
        });
        const reconciler = new MobilePushNotificationReconciler(dependencies);

        await reconciler.reconcileLiveActivity(activity.liveActivityUuid);

        expect(
            dependencies.notificationStore.deleteLiveActivity,
        ).not.toHaveBeenCalled();
        expect(
            dependencies.notificationStore.deleteInstallation,
        ).not.toHaveBeenCalled();
        expect(
            dependencies.notificationStore.markLiveActivityDelivered,
        ).not.toHaveBeenCalled();
    });

    it('deletes a registration when ownership no longer matches', async () => {
        const dependencies = createDependencies();
        dependencies.threadStore.findThreadOwnership.mockResolvedValue({
            threadUuid: activity.threadUuid,
            projectUuid: activity.projectUuid,
            agentUuid: activity.agentUuid,
            ownerUserUuid: 'another-user',
            createdFrom: 'web_app',
            ownerIsServiceAccount: false,
        });
        const reconciler = new MobilePushNotificationReconciler(dependencies);

        await reconciler.reconcileLiveActivity(activity.liveActivityUuid);

        expect(
            dependencies.notificationStore.deleteLiveActivity,
        ).toHaveBeenCalledWith({ liveActivityUuid: 'activity-uuid' });
        expect(dependencies.apnsClient.sendLiveActivity).not.toHaveBeenCalled();
    });
});

describe('MobilePushNotificationReconciler platform routing', () => {
    const androidActivity: ReconciliationActivity = {
        ...activity,
        platform: 'android',
        deviceToken: 'fcm-registration-token',
    };

    it('keeps an ios activity on APNs and never calls FCM', async () => {
        const dependencies = createDependencies();
        const reconciler = new MobilePushNotificationReconciler(dependencies);

        await reconciler.reconcileLiveActivity(activity.liveActivityUuid);

        expect(dependencies.apnsClient.sendLiveActivity).toHaveBeenCalledTimes(
            1,
        );
        expect(
            dependencies.fcmClient.sendAgentRunUpdate,
        ).not.toHaveBeenCalled();
    });

    it('sends an android update to FCM with the device token', async () => {
        const dependencies = createDependencies();
        dependencies.notificationStore.findLiveActivity.mockResolvedValue(
            androidActivity,
        );
        const reconciler = new MobilePushNotificationReconciler(dependencies);

        await reconciler.reconcileLiveActivity(activity.liveActivityUuid);

        expect(dependencies.apnsClient.sendLiveActivity).not.toHaveBeenCalled();
        expect(dependencies.fcmClient.sendAgentRunUpdate).toHaveBeenCalledWith({
            pushToken: 'fcm-registration-token',
            payload: {
                data: {
                    type: 'agent_run',
                    state: 'working',
                    event: 'update',
                    liveActivityUuid: 'activity-uuid',
                    projectUuid: 'project-uuid',
                    agentUuid: 'agent-uuid',
                    threadUuid: 'thread-uuid',
                    promptUuid: 'prompt-uuid',
                    timestamp: '1788091260',
                    staleAt: '1788091560',
                },
                android: {
                    priority: 'high',
                    collapse_key: 'activity-uuid',
                    ttl: '300s',
                },
            },
        });
    });

    it('sends to the installation device token, not the stored activity token', async () => {
        const dependencies = createDependencies();
        dependencies.notificationStore.findLiveActivity.mockResolvedValue({
            ...androidActivity,
            pushToken: 'a-stale-registration-token',
        });
        const reconciler = new MobilePushNotificationReconciler(dependencies);

        await reconciler.reconcileLiveActivity(activity.liveActivityUuid);

        expect(dependencies.fcmClient.sendAgentRunUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ pushToken: 'fcm-registration-token' }),
        );
    });

    it('records the platform on an android delivery', async () => {
        const dependencies = createDependencies();
        dependencies.notificationStore.findLiveActivity.mockResolvedValue(
            androidActivity,
        );
        const reconciler = new MobilePushNotificationReconciler(dependencies);

        await reconciler.reconcileLiveActivity(activity.liveActivityUuid);

        expect(dependencies.analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'mobile_push.live_activity_delivery',
                properties: expect.objectContaining({
                    platform: 'android',
                    activityEvent: 'update',
                    outcome: 'sent',
                }),
            }),
        );
    });

    it('sends an android completion alert to FCM', async () => {
        const dependencies = {
            ...createDependencies(),
            completionAlert: {
                title: 'Approved title',
                body: 'Approved body',
            },
        };
        dependencies.notificationStore.findLiveActivity.mockResolvedValue({
            ...androidActivity,
            lastDeliveredState: 'idle',
            endedAt: now,
        });
        const reconciler = new MobilePushNotificationReconciler(dependencies);

        await reconciler.reconcileLiveActivity(activity.liveActivityUuid);

        expect(dependencies.apnsClient.sendAlert).not.toHaveBeenCalled();
        expect(dependencies.fcmClient.sendAgentRunAlert).toHaveBeenCalledWith({
            pushToken: 'fcm-registration-token',
            payload: {
                notification: {
                    title: 'Approved title',
                    body: 'Approved body',
                },
                data: {
                    type: 'agent_run_completed',
                    projectUuid: 'project-uuid',
                    agentUuid: 'agent-uuid',
                    threadUuid: 'thread-uuid',
                    promptUuid: 'prompt-uuid',
                },
                android: {
                    priority: 'high',
                    collapse_key: 'activity-uuid',
                },
            },
        });
        expect(
            dependencies.notificationStore.markCompletionAlertCompleted,
        ).toHaveBeenCalledWith('activity-uuid');
    });

    it('deletes the installation when FCM rejects the android token', async () => {
        const dependencies = {
            ...createDependencies(),
            completionAlert: {
                title: 'Approved title',
                body: 'Approved body',
            },
        };
        dependencies.notificationStore.findLiveActivity.mockResolvedValue({
            ...androidActivity,
            lastDeliveredState: 'idle',
            endedAt: now,
        });
        dependencies.fcmClient.sendAgentRunAlert.mockResolvedValue({
            status: 'invalid_token',
            reason: 'UNREGISTERED',
        });
        const reconciler = new MobilePushNotificationReconciler(dependencies);

        await reconciler.reconcileLiveActivity(activity.liveActivityUuid);

        expect(
            dependencies.notificationStore.deleteInstallation,
        ).toHaveBeenCalledWith({
            installationUuid: 'public-installation-uuid',
            organizationUuid: 'organization-uuid',
            userUuid: 'user-uuid',
        });
    });

    it('surfaces a retryable android delivery to the job runner', async () => {
        const dependencies = createDependencies();
        dependencies.notificationStore.findLiveActivity.mockResolvedValue(
            androidActivity,
        );
        dependencies.fcmClient.sendAgentRunUpdate.mockResolvedValue({
            status: 'retryable',
            reason: 'UNAVAILABLE',
        });
        const reconciler = new MobilePushNotificationReconciler(dependencies);

        await expect(
            reconciler.reconcileLiveActivity(activity.liveActivityUuid),
        ).rejects.toThrow('Mobile push delivery is retryable: UNAVAILABLE');
        expect(
            dependencies.notificationStore.markLiveActivityDelivered,
        ).not.toHaveBeenCalled();
    });
});
