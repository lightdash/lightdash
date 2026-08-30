import { NotFoundError, ParameterError } from '@lightdash/common';
import {
    type LightdashAnalytics,
    type MobilePushNotificationEvent,
} from '../../../analytics/LightdashAnalytics';
import { type MobilePushNotificationsConfig } from '../../../config/parseConfig';
import Logger from '../../../logging/logger';
import { type MobilePushEnvironment } from '../../database/entities/mobilePushNotifications';

type MobilePushUser = {
    userUuid: string;
    organizationUuid?: string | null;
};

type MobilePushInstallation = {
    mobilePushInstallationUuid: string;
    installationUuid: string;
    organizationUuid: string;
    userUuid: string;
    environment: MobilePushEnvironment;
};

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
        environment: MobilePushEnvironment;
        deviceToken: string;
    }): Promise<MobilePushInstallation>;
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
    findThreadOwnership(args: {
        organizationUuid: string;
        threadUuid: string;
    }): Promise<MobilePushThreadOwnership | undefined>;
    findWebAppPrompt(promptUuid: string): Promise<MobilePushPrompt | undefined>;
};

type MobilePushNotificationServiceDependencies = {
    mobilePushNotificationStore: MobilePushNotificationStore;
    threadStore: MobilePushThreadStore;
    mobilePushNotificationsConfig: MobilePushNotificationsConfig;
    scheduler: {
        mobilePushLiveActivity(
            payload: SchedulableLiveActivity,
            runAt?: Date,
        ): Promise<unknown>;
    };
    reconciler: {
        reconcileLiveActivity(liveActivityUuid: string): Promise<void>;
    };
    analytics: Pick<LightdashAnalytics, 'track'>;
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
    if (pushToken.trim().length === 0 || pushToken.length > 4096) {
        throw new ParameterError('Push token is invalid');
    }
};

export class MobilePushNotificationService {
    private readonly mobilePushNotificationStore: MobilePushNotificationStore;

    private readonly threadStore: MobilePushThreadStore;

    private readonly config: MobilePushNotificationsConfig;

    private readonly scheduler: MobilePushNotificationServiceDependencies['scheduler'];

    private readonly reconciler: MobilePushNotificationServiceDependencies['reconciler'];

    private readonly analytics: MobilePushNotificationServiceDependencies['analytics'];

    constructor(dependencies: MobilePushNotificationServiceDependencies) {
        this.mobilePushNotificationStore =
            dependencies.mobilePushNotificationStore;
        this.threadStore = dependencies.threadStore;
        this.config = dependencies.mobilePushNotificationsConfig;
        this.scheduler = dependencies.scheduler;
        this.reconciler = dependencies.reconciler;
        this.analytics = dependencies.analytics;
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
    } {
        const environments: MobilePushEnvironment[] = [];
        if (this.config.sandbox !== undefined) environments.push('sandbox');
        if (this.config.production !== undefined)
            environments.push('production');

        return {
            enabled: this.config.enabled,
            environments: this.config.enabled ? environments : [],
        };
    }

    async registerInstallation(args: {
        user: MobilePushUser;
        installationUuid: string;
        environment: MobilePushEnvironment;
        deviceToken: string;
    }): Promise<void> {
        if (!this.config.enabled) return;
        validatePushToken(args.deviceToken);
        const { organizationUuid } = args.user;
        if (
            organizationUuid == null ||
            this.config[args.environment] === undefined
        ) {
            throw new NotFoundError('Mobile push registration not found');
        }

        await this.mobilePushNotificationStore.upsertInstallation({
            installationUuid: args.installationUuid,
            organizationUuid,
            userUuid: args.user.userUuid,
            environment: args.environment,
            deviceToken: args.deviceToken,
        });
        this.track({
            event: 'mobile_push.installation_registered',
            userId: args.user.userUuid,
            properties: {
                organizationId: organizationUuid,
                installationId: args.installationUuid,
                environment: args.environment,
            },
        });
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
    }

    async reconcileLiveActivity(liveActivityUuid: string): Promise<void> {
        if (!this.config.enabled) return;
        await this.reconciler.reconcileLiveActivity(liveActivityUuid);
    }

    async registerLiveActivity(args: RegisterLiveActivity): Promise<void> {
        if (!this.config.enabled) return;
        validatePushToken(args.pushToken);
        const { organizationUuid } = args.user;
        if (organizationUuid == null) {
            throw new NotFoundError('Mobile push registration not found');
        }

        const [installation, existingActivity, ownership, prompt] =
            await Promise.all([
                this.mobilePushNotificationStore.findInstallation(
                    args.installationUuid,
                ),
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
            installation?.organizationUuid !== organizationUuid ||
            installation.userUuid !== args.user.userUuid ||
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
