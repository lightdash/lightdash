import {
    type LightdashAnalytics,
    type MobilePushNotificationEvent,
} from '../../../analytics/LightdashAnalytics';
import {
    buildLiveActivityPayload,
    type AlertPayload,
    type ApnsDeliveryResult,
    type LiveActivityPayload,
} from '../../../clients/Apns/ApnsClient';
import {
    buildAgentRunAlertMessage,
    buildAgentRunDataMessage,
    type AgentRunAlertMessage,
    type AgentRunDataMessage,
} from '../../../clients/Fcm/FcmClient';
import { type MobilePushDeliveryResult } from '../../../clients/MobilePush/mobilePushDelivery';
import Logger from '../../../logging/logger';
import {
    type MobilePushEnvironment,
    type MobilePushPlatform,
} from '../../database/entities/mobilePushNotifications';
import { deriveAiAgentThreadLiveStatus } from '../AiAgentService/aiAgentThreadLiveStatus';
import { type AiAgentThreadLiveStateSignals } from '../AiAgentService/aiAgentThreadLiveStatus';

export type { AiAgentThreadLiveStateSignals };

export type ReconciliationActivity = {
    liveActivityUuid: string;
    mobilePushInstallationUuid: string;
    installationUuid: string;
    organizationUuid: string;
    userUuid: string;
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    promptUuid: string;
    platform: MobilePushPlatform;
    environment: MobilePushEnvironment;
    deviceToken: string;
    pushToken: string;
    lastDeliveredState: 'working' | 'waiting_for_you' | 'idle' | null;
    lastDeliveredStateChangedAt: Date | null;
    staleAt: Date | null;
    endedAt: Date | null;
    completionAlertCompletedAt: Date | null;
};

export type MobilePushReconciliationStore = {
    findLiveActivity(
        liveActivityUuid: string,
    ): Promise<ReconciliationActivity | undefined>;
    installationHasLiveGrant(installationUuid: string): Promise<boolean>;
    markLiveActivityDelivered(args: {
        liveActivityUuid: string;
        state: 'working' | 'waiting_for_you' | 'idle';
        stateChangedAt: Date;
        staleAt: Date;
        endedAt: Date | null;
    }): Promise<void>;
    markCompletionAlertCompleted(liveActivityUuid: string): Promise<void>;
    deleteInstallation(args: {
        installationUuid: string;
        organizationUuid: string;
        userUuid: string;
    }): Promise<void>;
    deleteLiveActivity(args: { liveActivityUuid: string }): Promise<void>;
};

type ReconciliationThreadOwnership = {
    threadUuid: string;
    projectUuid: string;
    agentUuid: string | null;
    ownerUserUuid: string | null;
    createdFrom: string;
    ownerIsServiceAccount: boolean;
};

export type MobilePushReconciliationThreadStore = {
    findThreadOwnership(args: {
        organizationUuid: string;
        threadUuid: string;
    }): Promise<ReconciliationThreadOwnership | undefined>;
    findThreadLiveStateSignals(args: {
        organizationUuid: string;
        threadUuids: string[];
        projectUuid: string | null;
        userUuid: string | null;
        agentUuids: string[] | null;
    }): Promise<AiAgentThreadLiveStateSignals[]>;
};

export type MobilePushApnsClient = {
    sendLiveActivity(args: {
        environment: MobilePushEnvironment;
        pushToken: string;
        payload: LiveActivityPayload;
    }): Promise<ApnsDeliveryResult>;
    sendAlert(args: {
        environment: MobilePushEnvironment;
        deviceToken: string;
        collapseId: string;
        payload: AlertPayload;
    }): Promise<ApnsDeliveryResult>;
};

export type MobilePushFcmClient = {
    sendAgentRunUpdate(args: {
        pushToken: string;
        payload: AgentRunDataMessage;
    }): Promise<MobilePushDeliveryResult>;
    sendAgentRunAlert(args: {
        pushToken: string;
        payload: AgentRunAlertMessage;
    }): Promise<MobilePushDeliveryResult>;
};

type ReconcilerDependencies = {
    notificationStore: MobilePushReconciliationStore;
    threadStore: MobilePushReconciliationThreadStore;
    apnsClient: MobilePushApnsClient;
    fcmClient: MobilePushFcmClient;
    scheduler: {
        mobilePushLiveActivity(
            payload: {
                liveActivityUuid: string;
                organizationUuid: string;
                projectUuid: string;
                userUuid: string;
            },
            runAt: Date,
        ): Promise<unknown>;
    };
    analytics: Pick<LightdashAnalytics, 'track'>;
    completionAlert?: AlertPayload['aps']['alert'];
    now?: () => Date;
};

const LIVE_ACTIVITY_STALE_AFTER_MS = 5 * 60 * 1000;
const LIVE_ACTIVITY_DISMISS_AFTER_MS = 60 * 1000;
const LIVE_ACTIVITY_REFRESH_WINDOW_MS = 60 * 1000;

export class MobilePushNotificationReconciler {
    private readonly notificationStore: MobilePushReconciliationStore;

    private readonly threadStore: MobilePushReconciliationThreadStore;

    private readonly apnsClient: MobilePushApnsClient;

    private readonly fcmClient: MobilePushFcmClient;

    private readonly scheduler: ReconcilerDependencies['scheduler'];

    private readonly analytics: ReconcilerDependencies['analytics'];

    private readonly completionAlert: ReconcilerDependencies['completionAlert'];

    private readonly now: () => Date;

    constructor(dependencies: ReconcilerDependencies) {
        this.notificationStore = dependencies.notificationStore;
        this.threadStore = dependencies.threadStore;
        this.apnsClient = dependencies.apnsClient;
        this.fcmClient = dependencies.fcmClient;
        this.scheduler = dependencies.scheduler;
        this.analytics = dependencies.analytics;
        this.completionAlert = dependencies.completionAlert;
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

    private async scheduleRefresh(
        activity: ReconciliationActivity,
        staleAt: Date,
    ): Promise<void> {
        await this.scheduler.mobilePushLiveActivity(
            {
                liveActivityUuid: activity.liveActivityUuid,
                organizationUuid: activity.organizationUuid,
                projectUuid: activity.projectUuid,
                userUuid: activity.userUuid,
            },
            new Date(staleAt.getTime() - LIVE_ACTIVITY_REFRESH_WINDOW_MS),
        );
    }

    private async deliverCompletionAlert(
        activity: ReconciliationActivity,
    ): Promise<'completed' | 'installation_deleted'> {
        if (
            this.completionAlert === undefined ||
            activity.completionAlertCompletedAt !== null
        ) {
            return 'completed';
        }

        const alert = this.completionAlert;
        const result =
            activity.platform === 'android'
                ? await this.fcmClient.sendAgentRunAlert({
                      pushToken: activity.deviceToken,
                      payload: buildAgentRunAlertMessage({
                          collapseId: activity.liveActivityUuid,
                          alert,
                          projectUuid: activity.projectUuid,
                          agentUuid: activity.agentUuid,
                          threadUuid: activity.threadUuid,
                          promptUuid: activity.promptUuid,
                      }),
                  })
                : await this.apnsClient.sendAlert({
                      environment: activity.environment,
                      deviceToken: activity.deviceToken,
                      collapseId: activity.liveActivityUuid,
                      payload: {
                          aps: { alert },
                          projectUuid: activity.projectUuid,
                          agentUuid: activity.agentUuid,
                          threadUuid: activity.threadUuid,
                          promptUuid: activity.promptUuid,
                      },
                  });
        this.track({
            event: 'mobile_push.completion_alert_delivery',
            userId: activity.userUuid,
            properties: {
                organizationId: activity.organizationUuid,
                projectId: activity.projectUuid,
                agentId: activity.agentUuid,
                threadId: activity.threadUuid,
                promptId: activity.promptUuid,
                installationId: activity.installationUuid,
                liveActivityId: activity.liveActivityUuid,
                platform: activity.platform,
                environment: activity.environment,
                outcome: result.status,
            },
        });

        if (result.status === 'invalid_token') {
            await this.notificationStore.deleteInstallation({
                installationUuid: activity.installationUuid,
                organizationUuid: activity.organizationUuid,
                userUuid: activity.userUuid,
            });
            return 'installation_deleted';
        }
        if (result.status === 'retryable') {
            throw new Error(
                `Mobile push alert delivery is retryable: ${result.reason ?? 'unknown'}`,
            );
        }

        await this.notificationStore.markCompletionAlertCompleted(
            activity.liveActivityUuid,
        );
        return 'completed';
    }

    async reconcileLiveActivity(liveActivityUuid: string): Promise<void> {
        const activity =
            await this.notificationStore.findLiveActivity(liveActivityUuid);
        if (activity === undefined) return;

        if (
            !(await this.notificationStore.installationHasLiveGrant(
                activity.installationUuid,
            ))
        ) {
            await this.notificationStore.deleteInstallation({
                installationUuid: activity.installationUuid,
                organizationUuid: activity.organizationUuid,
                userUuid: activity.userUuid,
            });
            Logger.info(
                'Removed a mobile push installation without a live grant',
                {
                    installationUuid: activity.installationUuid,
                    userUuid: activity.userUuid,
                },
            );
            return;
        }

        const ownership = await this.threadStore.findThreadOwnership({
            organizationUuid: activity.organizationUuid,
            threadUuid: activity.threadUuid,
        });
        if (
            ownership?.threadUuid !== activity.threadUuid ||
            ownership.projectUuid !== activity.projectUuid ||
            ownership.agentUuid !== activity.agentUuid ||
            ownership.ownerUserUuid !== activity.userUuid ||
            ownership.createdFrom !== 'web_app' ||
            ownership.ownerIsServiceAccount
        ) {
            await this.notificationStore.deleteLiveActivity({
                liveActivityUuid,
            });
            return;
        }

        if (activity.endedAt !== null) {
            await this.deliverCompletionAlert(activity);
            return;
        }

        const signals = await this.threadStore.findThreadLiveStateSignals({
            organizationUuid: activity.organizationUuid,
            threadUuids: [activity.threadUuid],
            projectUuid: activity.projectUuid,
            userUuid: activity.userUuid,
            agentUuids: [activity.agentUuid],
        });
        const threadSignals = signals[0];
        if (threadSignals === undefined) {
            await this.notificationStore.deleteLiveActivity({
                liveActivityUuid,
            });
            return;
        }

        const deliveryTime = this.now();
        const liveStatus = deriveAiAgentThreadLiveStatus(
            threadSignals,
            deliveryTime,
        );
        if (
            activity.lastDeliveredState === liveStatus.state &&
            activity.staleAt !== null &&
            activity.staleAt.getTime() - deliveryTime.getTime() >
                LIVE_ACTIVITY_REFRESH_WINDOW_MS
        ) {
            await this.scheduleRefresh(activity, activity.staleAt);
            return;
        }

        const staleAt =
            liveStatus.state === 'idle'
                ? deliveryTime
                : new Date(
                      deliveryTime.getTime() + LIVE_ACTIVITY_STALE_AFTER_MS,
                  );
        const endedAt = liveStatus.state === 'idle' ? deliveryTime : null;
        const dismissalAt =
            endedAt === null
                ? undefined
                : new Date(
                      deliveryTime.getTime() + LIVE_ACTIVITY_DISMISS_AFTER_MS,
                  );
        const stateChangedAt =
            liveStatus.stateChangedAt === null
                ? deliveryTime
                : new Date(liveStatus.stateChangedAt);
        const activityEvent = liveStatus.state === 'idle' ? 'end' : 'update';
        const result =
            activity.platform === 'android'
                ? await this.fcmClient.sendAgentRunUpdate({
                      pushToken: activity.deviceToken,
                      payload: buildAgentRunDataMessage({
                          state: liveStatus.state,
                          event: activityEvent,
                          liveActivityUuid: activity.liveActivityUuid,
                          projectUuid: activity.projectUuid,
                          agentUuid: activity.agentUuid,
                          threadUuid: activity.threadUuid,
                          promptUuid: activity.promptUuid,
                          timestamp: deliveryTime,
                          staleAt,
                      }),
                  })
                : await this.apnsClient.sendLiveActivity({
                      environment: activity.environment,
                      pushToken: activity.pushToken,
                      payload: buildLiveActivityPayload({
                          state: liveStatus.state,
                          timestamp: deliveryTime,
                          staleAt,
                          dismissalAt,
                          event: activityEvent,
                          projectUuid: activity.projectUuid,
                          agentUuid: activity.agentUuid,
                          threadUuid: activity.threadUuid,
                          promptUuid: activity.promptUuid,
                      }),
                  });
        this.track({
            event: 'mobile_push.live_activity_delivery',
            userId: activity.userUuid,
            properties: {
                organizationId: activity.organizationUuid,
                projectId: activity.projectUuid,
                agentId: activity.agentUuid,
                threadId: activity.threadUuid,
                promptId: activity.promptUuid,
                installationId: activity.installationUuid,
                liveActivityId: activity.liveActivityUuid,
                platform: activity.platform,
                environment: activity.environment,
                state: liveStatus.state,
                activityEvent,
                outcome: result.status,
            },
        });

        if (result.status === 'invalid_token') {
            if (liveStatus.state === 'idle') {
                const alertResult = await this.deliverCompletionAlert(activity);
                if (alertResult === 'installation_deleted') return;
            }
            await this.notificationStore.deleteLiveActivity({
                liveActivityUuid,
            });
            return;
        }
        if (result.status === 'retryable') {
            throw new Error(
                `Mobile push delivery is retryable: ${result.reason ?? 'unknown'}`,
            );
        }
        if (result.status === 'failed') {
            if (liveStatus.state === 'idle') {
                const alertResult = await this.deliverCompletionAlert(activity);
                if (alertResult === 'installation_deleted') return;
            }
            return;
        }

        await this.notificationStore.markLiveActivityDelivered({
            liveActivityUuid,
            state: liveStatus.state,
            stateChangedAt,
            staleAt,
            endedAt,
        });
        if (endedAt === null) {
            await this.scheduleRefresh(activity, staleAt);
        } else {
            await this.deliverCompletionAlert(activity);
        }
    }
}
