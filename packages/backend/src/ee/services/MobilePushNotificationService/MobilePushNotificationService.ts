import {
    MOBILE_PUSH_LIVE_ACTIVITY_START_MAX_ATTEMPTS,
    NotFoundError,
    ParameterError,
} from '@lightdash/common';
import { validate as isValidUuid } from 'uuid';
import {
    type LightdashAnalytics,
    type MobilePushNotificationEvent,
} from '../../../analytics/LightdashAnalytics';
import {
    buildLiveActivityStartPayload,
    type ApnsDeliveryResult,
    type LiveActivityStartPayload,
} from '../../../clients/Apns/ApnsClient';
import { type MobilePushNotificationsConfig } from '../../../config/parseConfig';
import Logger from '../../../logging/logger';
import {
    type MobilePushEnvironment,
    type MobilePushPlatform,
} from '../../database/entities/mobilePushNotifications';
import {
    type LiveActivityStartAttempt,
    type SchedulableLiveActivityStartAttempt,
} from '../../models/MobilePushNotificationModel';

type MobilePushUser = {
    userUuid: string;
    organizationUuid?: string | null;
};

type MobilePushInstallation = {
    mobilePushInstallationUuid: string;
    installationUuid: string;
    organizationUuid: string;
    userUuid: string;
    platform: MobilePushPlatform;
    environment: MobilePushEnvironment;
};

type UpsertInstallationResult =
    | { status: 'stored'; installation: MobilePushInstallation }
    | { status: 'owner_mismatch' };

type MobilePushThreadOwnership = {
    threadUuid: string;
    projectUuid: string;
    agentUuid: string | null;
    ownerUserUuid: string | null;
    createdFrom: string;
    ownerIsServiceAccount: boolean;
};

type MobilePushPrompt = {
    organizationUuid: string;
    projectUuid: string;
    promptUuid: string;
    threadUuid: string;
    agentUuid: string | null;
    createdByUserUuid: string;
    prompt: string;
};

type UpsertLiveActivity = {
    liveActivityUuid: string;
    mobilePushInstallationUuid: string;
    organizationUuid: string;
    userUuid: string;
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    promptUuid: string;
    pushToken: string;
};

type LiveActivityOwner = Omit<UpsertLiveActivity, 'pushToken'>;

type SchedulableLiveActivity = {
    liveActivityUuid: string;
    organizationUuid: string;
    projectUuid: string;
    userUuid: string;
};

export type MobilePushNotificationStore = {
    findInstallation(
        installationUuid: string,
    ): Promise<MobilePushInstallation | undefined>;
    findLiveActivityOwner(
        liveActivityUuid: string,
    ): Promise<LiveActivityOwner | undefined>;
    upsertInstallation(args: {
        installationUuid: string;
        organizationUuid: string;
        userUuid: string;
        platform: MobilePushPlatform;
        environment: MobilePushEnvironment;
        deviceToken: string;
    }): Promise<UpsertInstallationResult>;
    registerPushToStartToken(args: {
        installationUuid: string;
        organizationUuid: string;
        userUuid: string;
        environment: MobilePushEnvironment;
        pushToken: string;
    }): Promise<boolean>;
    clearPushToStartTokenIfFingerprintMatches(args: {
        installationUuid: string;
        organizationUuid: string;
        userUuid: string;
        pushTokenFingerprint: string;
    }): Promise<boolean>;
    createLiveActivityStartAttempts(args: {
        organizationUuid: string;
        userUuid: string;
        promptUuid: string;
        excludedMobilePushInstallationUuid: string | null;
        environments: MobilePushEnvironment[];
    }): Promise<
        Pick<
            SchedulableLiveActivityStartAttempt,
            'liveActivityStartAttemptUuid' | 'installationUuid'
        >[]
    >;
    claimLiveActivityStartAttempt(args: {
        liveActivityStartAttemptUuid: string;
        attemptedAt: Date;
        retryProcessingBefore: Date;
        maxAttempts: number;
    }): Promise<LiveActivityStartAttempt | undefined>;
    markLiveActivityStartAttempt(args: {
        liveActivityStartAttemptUuid: string;
        status: 'retryable' | 'sent' | 'failed';
        pushTokenFingerprint: string | null;
        completedAt: Date | null;
    }): Promise<boolean>;
    findLiveActivityStartAttemptsDue(args: {
        retryProcessingBefore: Date;
        environments: MobilePushEnvironment[];
        limit: number;
        maxAttempts: number;
    }): Promise<SchedulableLiveActivityStartAttempt[]>;
    deleteInstallation(args: {
        installationUuid: string;
        organizationUuid: string;
        userUuid: string;
    }): Promise<void>;
    upsertLiveActivity(activity: UpsertLiveActivity): Promise<void>;
    deleteLiveActivity(args: {
        liveActivityUuid: string;
        installationUuid?: string;
        organizationUuid?: string;
        userUuid?: string;
        projectUuid?: string;
        agentUuid?: string;
        threadUuid?: string;
    }): Promise<void>;
    findActiveLiveActivitiesForThread(
        threadUuid: string,
    ): Promise<SchedulableLiveActivity[]>;
    findLiveActivitiesDueForReconciliation(
        dueBefore: Date,
        limit: number,
    ): Promise<SchedulableLiveActivity[]>;
};

export type MobilePushThreadStore = {
    getAgent(args: {
        organizationUuid: string;
        projectUuid?: string;
        agentUuid: string;
    }): Promise<{
        uuid: string;
        organizationUuid: string;
        projectUuid: string;
        name: string;
    }>;
    findThreadOwnership(args: {
        organizationUuid: string;
        threadUuid: string;
    }): Promise<MobilePushThreadOwnership | undefined>;
    findWebAppPrompt(promptUuid: string): Promise<MobilePushPrompt | undefined>;
};

export type MobilePushProjectStore = {
    getSummary(projectUuid: string): Promise<{
        projectUuid: string;
        organizationUuid: string;
    }>;
};

type MobilePushStartApnsClient = {
    sendLiveActivityStart(args: {
        environment: MobilePushEnvironment;
        pushToStartToken: string;
        liveActivityUuid: string;
        payload: LiveActivityStartPayload;
    }): Promise<ApnsDeliveryResult>;
};

type MobilePushNotificationServiceDependencies = {
    mobilePushNotificationStore: MobilePushNotificationStore;
    threadStore: MobilePushThreadStore;
    projectStore: MobilePushProjectStore;
    mobilePushNotificationsConfig: MobilePushNotificationsConfig;
    scheduler: {
        mobilePushLiveActivity(
            payload: SchedulableLiveActivity,
            runAt?: Date,
        ): Promise<unknown>;
        mobilePushLiveActivityStart(payload: {
            liveActivityStartAttemptUuid: string;
            organizationUuid: string;
            projectUuid: string;
            userUuid: string;
        }): Promise<unknown>;
    };
    reconciler: {
        reconcileLiveActivity(liveActivityUuid: string): Promise<void>;
    };
    analytics: Pick<LightdashAnalytics, 'track'>;
    apnsClient: MobilePushStartApnsClient;
    now?: () => Date;
};

type RegisterLiveActivity = {
    user: MobilePushUser;
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    liveActivityUuid: string;
    installationUuid: string;
    promptUuid: string;
    pushToken: string;
};

const validatePushToken = (pushToken: string): void => {
    if (
        pushToken.length === 0 ||
        pushToken.length > 512 ||
        !/^[0-9a-f]+$/i.test(pushToken)
    ) {
        throw new ParameterError('Push token is invalid');
    }
};

const validateDeviceToken = (
    platform: MobilePushPlatform,
    deviceToken: string,
): void => {
    if (platform === 'ios') {
        validatePushToken(deviceToken);
        return;
    }
    if (
        deviceToken.length === 0 ||
        deviceToken.length > 4096 ||
        !/^[A-Za-z0-9_:.%-]+$/.test(deviceToken)
    ) {
        throw new ParameterError('Push token is invalid');
    }
};

const LIVE_ACTIVITY_START_STALE_AFTER_MS = 5 * 60 * 1000;
const LIVE_ACTIVITY_START_PROCESSING_LEASE_MS = 5 * 60 * 1000;

export class MobilePushNotificationService {
    private readonly mobilePushNotificationStore: MobilePushNotificationStore;

    private readonly threadStore: MobilePushThreadStore;

    private readonly projectStore: MobilePushProjectStore;

    private readonly config: MobilePushNotificationsConfig;

    private readonly scheduler: MobilePushNotificationServiceDependencies['scheduler'];

    private readonly reconciler: MobilePushNotificationServiceDependencies['reconciler'];

    private readonly analytics: MobilePushNotificationServiceDependencies['analytics'];

    private readonly apnsClient: MobilePushStartApnsClient;

    private readonly now: () => Date;

    constructor(dependencies: MobilePushNotificationServiceDependencies) {
        this.mobilePushNotificationStore =
            dependencies.mobilePushNotificationStore;
        this.threadStore = dependencies.threadStore;
        this.projectStore = dependencies.projectStore;
        this.config = dependencies.mobilePushNotificationsConfig;
        this.scheduler = dependencies.scheduler;
        this.reconciler = dependencies.reconciler;
        this.analytics = dependencies.analytics;
        this.apnsClient = dependencies.apnsClient;
        this.now = dependencies.now ?? (() => new Date());
    }

    private track(event: MobilePushNotificationEvent): void {
        try {
            this.analytics.track(event);
        } catch (error) {
            Logger.warn('Unable to track mobile push analytics', {
                event: event.event,
                error,
            });
        }
    }

    getStatus(): {
        enabled: boolean;
        environments: MobilePushEnvironment[];
        platforms: MobilePushPlatform[];
    } {
        const environments: MobilePushEnvironment[] = [];
        if (this.config.sandbox !== undefined) environments.push('sandbox');
        if (this.config.production !== undefined)
            environments.push('production');

        const platforms: MobilePushPlatform[] = [];
        if (this.config.teamId !== undefined && environments.length > 0)
            platforms.push('ios');
        if (this.config.fcm !== undefined) platforms.push('android');

        return {
            enabled: this.config.enabled,
            environments: this.config.enabled ? environments : [],
            platforms: this.config.enabled ? platforms : [],
        };
    }

    private isPlatformConfigured(
        platform: MobilePushPlatform,
        environment: MobilePushEnvironment,
    ): boolean {
        return platform === 'android'
            ? this.config.fcm !== undefined
            : this.config[environment] !== undefined;
    }

    private getConfiguredEnvironments(): MobilePushEnvironment[] {
        return (['sandbox', 'production'] as const).filter(
            (environment) => this.config[environment] !== undefined,
        );
    }

    private async hasExactPromptOwnership(args: {
        organizationUuid: string;
        projectUuid: string;
        agentUuid: string;
        threadUuid: string;
        promptUuid: string;
        userUuid: string;
    }): Promise<boolean> {
        try {
            const [project, agent, ownership, prompt] = await Promise.all([
                this.projectStore.getSummary(args.projectUuid),
                this.threadStore.getAgent({
                    organizationUuid: args.organizationUuid,
                    projectUuid: args.projectUuid,
                    agentUuid: args.agentUuid,
                }),
                this.threadStore.findThreadOwnership({
                    organizationUuid: args.organizationUuid,
                    threadUuid: args.threadUuid,
                }),
                this.threadStore.findWebAppPrompt(args.promptUuid),
            ]);

            return (
                project.projectUuid === args.projectUuid &&
                project.organizationUuid === args.organizationUuid &&
                agent.uuid === args.agentUuid &&
                agent.organizationUuid === args.organizationUuid &&
                agent.projectUuid === args.projectUuid &&
                ownership?.threadUuid === args.threadUuid &&
                ownership.projectUuid === args.projectUuid &&
                ownership.agentUuid === args.agentUuid &&
                ownership.ownerUserUuid === args.userUuid &&
                ownership.createdFrom === 'web_app' &&
                !ownership.ownerIsServiceAccount &&
                prompt?.organizationUuid === args.organizationUuid &&
                prompt.projectUuid === args.projectUuid &&
                prompt.agentUuid === args.agentUuid &&
                prompt.threadUuid === args.threadUuid &&
                prompt.promptUuid === args.promptUuid &&
                prompt.createdByUserUuid === args.userUuid
            );
        } catch {
            return false;
        }
    }

    private async scheduleLiveActivityStartAttempts(
        attempts: SchedulableLiveActivityStartAttempt[],
    ): Promise<void> {
        await attempts.reduce<Promise<void>>(
            (previous, attempt) =>
                previous.then(async () => {
                    await this.scheduler.mobilePushLiveActivityStart({
                        liveActivityStartAttemptUuid:
                            attempt.liveActivityStartAttemptUuid,
                        organizationUuid: attempt.organizationUuid,
                        projectUuid: attempt.projectUuid,
                        userUuid: attempt.userUuid,
                    });
                }),
            Promise.resolve(),
        );
    }

    async registerInstallation(args: {
        user: MobilePushUser;
        installationUuid: string;
        platform: MobilePushPlatform;
        environment: MobilePushEnvironment;
        deviceToken: string;
    }): Promise<void> {
        if (!this.config.enabled) return;
        validateDeviceToken(args.platform, args.deviceToken);
        const { organizationUuid } = args.user;
        if (
            organizationUuid == null ||
            !this.isPlatformConfigured(args.platform, args.environment)
        ) {
            throw new NotFoundError('Mobile push registration not found');
        }

        const result =
            await this.mobilePushNotificationStore.upsertInstallation({
                installationUuid: args.installationUuid,
                organizationUuid,
                userUuid: args.user.userUuid,
                platform: args.platform,
                environment: args.environment,
                deviceToken: args.deviceToken,
            });
        if (result.status === 'owner_mismatch') {
            throw new NotFoundError('Mobile push registration not found');
        }
        this.track({
            event: 'mobile_push.installation_registered',
            userId: args.user.userUuid,
            properties: {
                organizationId: organizationUuid,
                installationId: args.installationUuid,
                platform: args.platform,
                environment: args.environment,
            },
        });
    }

    async registerPushToStartToken(args: {
        user: MobilePushUser;
        installationUuid: string;
        pushToken: string;
    }): Promise<void> {
        if (!this.config.enabled) {
            throw new NotFoundError('Mobile push registration not found');
        }
        validatePushToken(args.pushToken);
        const { organizationUuid } = args.user;
        if (organizationUuid == null) {
            throw new NotFoundError('Mobile push registration not found');
        }

        const installation =
            await this.mobilePushNotificationStore.findInstallation(
                args.installationUuid,
            );
        if (
            installation?.organizationUuid !== organizationUuid ||
            installation.userUuid !== args.user.userUuid ||
            installation.platform !== 'ios'
        ) {
            throw new NotFoundError('Mobile push registration not found');
        }
        if (this.config[installation.environment] === undefined) {
            throw new NotFoundError('Mobile push registration not found');
        }

        const registered =
            await this.mobilePushNotificationStore.registerPushToStartToken({
                installationUuid: args.installationUuid,
                organizationUuid,
                userUuid: args.user.userUuid,
                environment: installation.environment,
                pushToken: args.pushToken,
            });
        if (!registered) {
            throw new NotFoundError('Mobile push registration not found');
        }
    }

    async startLiveActivitiesForPrompt(args: {
        user: MobilePushUser;
        projectUuid: string;
        agentUuid: string;
        threadUuid: string;
        promptUuid: string;
        originatingInstallationUuid: string | undefined;
    }): Promise<void> {
        if (!this.config.enabled) return;
        const { organizationUuid } = args.user;
        if (organizationUuid == null) return;
        const environments = this.getConfiguredEnvironments();
        if (environments.length === 0) return;
        if (
            !(await this.hasExactPromptOwnership({
                organizationUuid,
                projectUuid: args.projectUuid,
                agentUuid: args.agentUuid,
                threadUuid: args.threadUuid,
                promptUuid: args.promptUuid,
                userUuid: args.user.userUuid,
            }))
        ) {
            return;
        }

        const originInstallation =
            args.originatingInstallationUuid !== undefined &&
            isValidUuid(args.originatingInstallationUuid)
                ? await this.mobilePushNotificationStore.findInstallation(
                      args.originatingInstallationUuid,
                  )
                : undefined;
        const excludedMobilePushInstallationUuid =
            originInstallation?.organizationUuid === organizationUuid &&
            originInstallation.userUuid === args.user.userUuid
                ? originInstallation.mobilePushInstallationUuid
                : null;
        const attempts =
            await this.mobilePushNotificationStore.createLiveActivityStartAttempts(
                {
                    organizationUuid,
                    userUuid: args.user.userUuid,
                    promptUuid: args.promptUuid,
                    excludedMobilePushInstallationUuid,
                    environments,
                },
            );

        await this.scheduleLiveActivityStartAttempts(
            attempts.map((attempt) => ({
                ...attempt,
                organizationUuid,
                projectUuid: args.projectUuid,
                userUuid: args.user.userUuid,
            })),
        );
    }

    async revokeInstallation(args: {
        user: MobilePushUser;
        installationUuid: string;
    }): Promise<void> {
        const { organizationUuid } = args.user;
        if (organizationUuid == null) return;

        await this.mobilePushNotificationStore.deleteInstallation({
            installationUuid: args.installationUuid,
            organizationUuid,
            userUuid: args.user.userUuid,
        });
    }

    async revokeLiveActivity(args: {
        user: MobilePushUser;
        installationUuid: string;
        projectUuid: string;
        agentUuid: string;
        threadUuid: string;
        liveActivityUuid: string;
    }): Promise<void> {
        const { organizationUuid } = args.user;
        if (organizationUuid == null) return;

        await this.mobilePushNotificationStore.deleteLiveActivity({
            installationUuid: args.installationUuid,
            organizationUuid,
            userUuid: args.user.userUuid,
            projectUuid: args.projectUuid,
            agentUuid: args.agentUuid,
            threadUuid: args.threadUuid,
            liveActivityUuid: args.liveActivityUuid,
        });
    }

    async enqueueThreadReconciliation(threadUuid: string): Promise<void> {
        if (!this.config.enabled) return;
        const activities =
            await this.mobilePushNotificationStore.findActiveLiveActivitiesForThread(
                threadUuid,
            );
        await Promise.all(
            activities.map((activity) =>
                this.scheduler.mobilePushLiveActivity(activity),
            ),
        );
    }

    async sweepLiveActivities(now: Date = new Date()): Promise<void> {
        if (!this.config.enabled) return;
        const activities =
            await this.mobilePushNotificationStore.findLiveActivitiesDueForReconciliation(
                new Date(now.getTime() + 60 * 1000),
                500,
            );
        await Promise.all(
            activities.map((activity) =>
                this.scheduler.mobilePushLiveActivity(activity),
            ),
        );
        const startAttempts =
            await this.mobilePushNotificationStore.findLiveActivityStartAttemptsDue(
                {
                    retryProcessingBefore: new Date(
                        now.getTime() - LIVE_ACTIVITY_START_PROCESSING_LEASE_MS,
                    ),
                    environments: this.getConfiguredEnvironments(),
                    limit: 500,
                    maxAttempts: MOBILE_PUSH_LIVE_ACTIVITY_START_MAX_ATTEMPTS,
                },
            );
        await this.scheduleLiveActivityStartAttempts(startAttempts);
    }

    async reconcileLiveActivity(liveActivityUuid: string): Promise<void> {
        if (!this.config.enabled) return;
        await this.reconciler.reconcileLiveActivity(liveActivityUuid);
    }

    async deliverLiveActivityStart(
        liveActivityStartAttemptUuid: string,
    ): Promise<void> {
        if (!this.config.enabled) return;
        const attemptedAt = this.now();
        const attempt =
            await this.mobilePushNotificationStore.claimLiveActivityStartAttempt(
                {
                    liveActivityStartAttemptUuid,
                    attemptedAt,
                    retryProcessingBefore: new Date(
                        attemptedAt.getTime() -
                            LIVE_ACTIVITY_START_PROCESSING_LEASE_MS,
                    ),
                    maxAttempts: MOBILE_PUSH_LIVE_ACTIVITY_START_MAX_ATTEMPTS,
                },
            );
        if (attempt === undefined) return;

        const prompt = await this.threadStore.findWebAppPrompt(
            attempt.promptUuid,
        );
        if (
            prompt === undefined ||
            prompt.agentUuid === null ||
            !(await this.hasExactPromptOwnership({
                organizationUuid: attempt.organizationUuid,
                projectUuid: prompt.projectUuid,
                agentUuid: prompt.agentUuid,
                threadUuid: prompt.threadUuid,
                promptUuid: prompt.promptUuid,
                userUuid: attempt.userUuid,
            })) ||
            attempt.pushToStartToken === null ||
            attempt.pushToStartTokenFingerprint === null ||
            this.config[attempt.environment] === undefined
        ) {
            await this.mobilePushNotificationStore.markLiveActivityStartAttempt(
                {
                    liveActivityStartAttemptUuid,
                    status: 'failed',
                    pushTokenFingerprint: attempt.pushToStartTokenFingerprint,
                    completedAt: attemptedAt,
                },
            );
            return;
        }

        const agent = await this.threadStore.getAgent({
            organizationUuid: attempt.organizationUuid,
            projectUuid: prompt.projectUuid,
            agentUuid: prompt.agentUuid,
        });

        const payload = buildLiveActivityStartPayload({
            timestamp: attemptedAt,
            staleAt: new Date(
                attemptedAt.getTime() + LIVE_ACTIVITY_START_STALE_AFTER_MS,
            ),
            liveActivityUuid: attempt.liveActivityUuid,
            installationUuid: attempt.installationUuid,
            projectUuid: prompt.projectUuid,
            agentUuid: prompt.agentUuid,
            threadUuid: prompt.threadUuid,
            promptUuid: prompt.promptUuid,
            agentName: agent.name,
            taskSummary: prompt.prompt,
        });
        const result = await this.apnsClient.sendLiveActivityStart({
            environment: attempt.environment,
            pushToStartToken: attempt.pushToStartToken,
            liveActivityUuid: attempt.liveActivityUuid,
            payload,
        });

        if (result.status === 'sent') {
            await this.mobilePushNotificationStore.markLiveActivityStartAttempt(
                {
                    liveActivityStartAttemptUuid,
                    status: 'sent',
                    pushTokenFingerprint: attempt.pushToStartTokenFingerprint,
                    completedAt: attemptedAt,
                },
            );
            return;
        }

        if (result.status === 'invalid_token') {
            const cleared =
                await this.mobilePushNotificationStore.clearPushToStartTokenIfFingerprintMatches(
                    {
                        installationUuid: attempt.installationUuid,
                        organizationUuid: attempt.organizationUuid,
                        userUuid: attempt.userUuid,
                        pushTokenFingerprint:
                            attempt.pushToStartTokenFingerprint,
                    },
                );
            if (
                cleared ||
                attempt.attemptCount >=
                    MOBILE_PUSH_LIVE_ACTIVITY_START_MAX_ATTEMPTS
            ) {
                await this.mobilePushNotificationStore.markLiveActivityStartAttempt(
                    {
                        liveActivityStartAttemptUuid,
                        status: 'failed',
                        pushTokenFingerprint:
                            attempt.pushToStartTokenFingerprint,
                        completedAt: attemptedAt,
                    },
                );
                return;
            }

            await this.mobilePushNotificationStore.markLiveActivityStartAttempt(
                {
                    liveActivityStartAttemptUuid,
                    status: 'retryable',
                    pushTokenFingerprint: attempt.pushToStartTokenFingerprint,
                    completedAt: null,
                },
            );
            throw new Error(
                'APNs Live Activity start token rotated during delivery',
            );
        }

        if (
            result.status === 'retryable' &&
            attempt.attemptCount < MOBILE_PUSH_LIVE_ACTIVITY_START_MAX_ATTEMPTS
        ) {
            await this.mobilePushNotificationStore.markLiveActivityStartAttempt(
                {
                    liveActivityStartAttemptUuid,
                    status: 'retryable',
                    pushTokenFingerprint: attempt.pushToStartTokenFingerprint,
                    completedAt: null,
                },
            );
            throw new Error('APNs Live Activity start delivery is retryable');
        }

        await this.mobilePushNotificationStore.markLiveActivityStartAttempt({
            liveActivityStartAttemptUuid,
            status: 'failed',
            pushTokenFingerprint: attempt.pushToStartTokenFingerprint,
            completedAt: attemptedAt,
        });
    }

    async registerLiveActivity(args: RegisterLiveActivity): Promise<void> {
        if (!this.config.enabled) return;
        const { organizationUuid } = args.user;
        if (organizationUuid == null) {
            throw new NotFoundError('Mobile push registration not found');
        }

        const installation =
            await this.mobilePushNotificationStore.findInstallation(
                args.installationUuid,
            );
        if (
            installation?.organizationUuid !== organizationUuid ||
            installation.userUuid !== args.user.userUuid
        ) {
            throw new NotFoundError('Mobile push registration not found');
        }
        validateDeviceToken(installation.platform, args.pushToken);

        const [existingActivity, ownership, prompt] = await Promise.all([
            this.mobilePushNotificationStore.findLiveActivityOwner(
                args.liveActivityUuid,
            ),
            this.threadStore.findThreadOwnership({
                organizationUuid,
                threadUuid: args.threadUuid,
            }),
            this.threadStore.findWebAppPrompt(args.promptUuid),
        ]);

        if (
            (existingActivity !== undefined &&
                (existingActivity.mobilePushInstallationUuid !==
                    installation.mobilePushInstallationUuid ||
                    existingActivity.organizationUuid !== organizationUuid ||
                    existingActivity.userUuid !== args.user.userUuid ||
                    existingActivity.projectUuid !== args.projectUuid ||
                    existingActivity.agentUuid !== args.agentUuid ||
                    existingActivity.threadUuid !== args.threadUuid ||
                    existingActivity.promptUuid !== args.promptUuid)) ||
            ownership?.projectUuid !== args.projectUuid ||
            ownership.agentUuid !== args.agentUuid ||
            ownership.ownerUserUuid !== args.user.userUuid ||
            ownership.threadUuid !== args.threadUuid ||
            ownership.createdFrom !== 'web_app' ||
            ownership.ownerIsServiceAccount ||
            prompt?.organizationUuid !== organizationUuid ||
            prompt.projectUuid !== args.projectUuid ||
            prompt.agentUuid !== args.agentUuid ||
            prompt.threadUuid !== args.threadUuid ||
            prompt.createdByUserUuid !== args.user.userUuid
        ) {
            throw new NotFoundError('Mobile push registration not found');
        }

        await this.mobilePushNotificationStore.upsertLiveActivity({
            liveActivityUuid: args.liveActivityUuid,
            mobilePushInstallationUuid: installation.mobilePushInstallationUuid,
            organizationUuid,
            userUuid: args.user.userUuid,
            projectUuid: args.projectUuid,
            agentUuid: args.agentUuid,
            threadUuid: args.threadUuid,
            promptUuid: args.promptUuid,
            pushToken: args.pushToken,
        });
        this.track({
            event: 'mobile_push.live_activity_registered',
            userId: args.user.userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId: args.projectUuid,
                agentId: args.agentUuid,
                threadId: args.threadUuid,
                promptId: args.promptUuid,
                installationId: args.installationUuid,
                liveActivityId: args.liveActivityUuid,
                platform: installation.platform,
                environment: installation.environment,
            },
        });
        await this.scheduler.mobilePushLiveActivity({
            liveActivityUuid: args.liveActivityUuid,
            organizationUuid,
            projectUuid: args.projectUuid,
            userUuid: args.user.userUuid,
        });
    }
}
