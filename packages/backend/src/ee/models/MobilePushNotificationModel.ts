import { createHash } from 'crypto';
import { Knex } from 'knex';
import { type EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import {
    AiAgentLiveActivitiesTableName,
    MobilePushInstallationsTableName,
    type DbAiAgentLiveActivity,
    type DbMobilePushInstallation,
    type MobilePushEnvironment,
} from '../database/entities/mobilePushNotifications';

type MobilePushNotificationModelDependencies = {
    database: Knex;
    encryptionUtil: EncryptionUtil;
};

export type MobilePushInstallation = {
    mobilePushInstallationUuid: string;
    installationUuid: string;
    organizationUuid: string;
    userUuid: string;
    environment: MobilePushEnvironment;
};

export type AiAgentLiveActivity = {
    liveActivityUuid: string;
    mobilePushInstallationUuid: string;
    installationUuid: string;
    organizationUuid: string;
    userUuid: string;
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
    promptUuid: string;
    environment: MobilePushEnvironment;
    deviceToken: string;
    pushToken: string;
    lastDeliveredState: DbAiAgentLiveActivity['last_delivered_state'];
    lastDeliveredStateChangedAt: Date | null;
    staleAt: Date | null;
    endedAt: Date | null;
    completionAlertCompletedAt: Date | null;
};

const tokenFingerprint = (token: string): string =>
    createHash('sha256').update(token).digest('hex');

export class MobilePushNotificationModel {
    private readonly database: Knex;

    private readonly encryptionUtil: EncryptionUtil;

    constructor(dependencies: MobilePushNotificationModelDependencies) {
        this.database = dependencies.database;
        this.encryptionUtil = dependencies.encryptionUtil;
    }

    async findInstallation(
        installationUuid: string,
    ): Promise<MobilePushInstallation | undefined> {
        return this.database<DbMobilePushInstallation>(
            MobilePushInstallationsTableName,
        )
            .select({
                mobilePushInstallationUuid: 'mobile_push_installation_uuid',
                installationUuid: 'installation_uuid',
                organizationUuid: 'organization_uuid',
                userUuid: 'user_uuid',
                environment: 'environment',
            })
            .where('installation_uuid', installationUuid)
            .first();
    }

    async upsertInstallation(args: {
        installationUuid: string;
        organizationUuid: string;
        userUuid: string;
        environment: MobilePushEnvironment;
        deviceToken: string;
    }): Promise<MobilePushInstallation> {
        const fingerprint = tokenFingerprint(args.deviceToken);
        const encryptedDeviceToken = this.encryptionUtil.encrypt(
            args.deviceToken,
        );

        return this.database.transaction(async (trx) => {
            const existing = await trx<DbMobilePushInstallation>(
                MobilePushInstallationsTableName,
            )
                .select(
                    'mobile_push_installation_uuid',
                    'organization_uuid',
                    'user_uuid',
                )
                .where('installation_uuid', args.installationUuid)
                .first();

            if (
                existing !== undefined &&
                (existing.organization_uuid !== args.organizationUuid ||
                    existing.user_uuid !== args.userUuid)
            ) {
                await trx<DbAiAgentLiveActivity>(AiAgentLiveActivitiesTableName)
                    .where(
                        'mobile_push_installation_uuid',
                        existing.mobile_push_installation_uuid,
                    )
                    .delete();
            }

            await trx<DbMobilePushInstallation>(
                MobilePushInstallationsTableName,
            )
                .where({
                    environment: args.environment,
                    device_token_fingerprint: fingerprint,
                })
                .whereNot('installation_uuid', args.installationUuid)
                .delete();

            const [row] = await trx<DbMobilePushInstallation>(
                MobilePushInstallationsTableName,
            )
                .insert({
                    installation_uuid: args.installationUuid,
                    organization_uuid: args.organizationUuid,
                    user_uuid: args.userUuid,
                    environment: args.environment,
                    encrypted_device_token: encryptedDeviceToken,
                    device_token_fingerprint: fingerprint,
                })
                .onConflict('installation_uuid')
                .merge({
                    organization_uuid: args.organizationUuid,
                    user_uuid: args.userUuid,
                    environment: args.environment,
                    encrypted_device_token: encryptedDeviceToken,
                    device_token_fingerprint: fingerprint,
                    updated_at: new Date(),
                })
                .returning([
                    'mobile_push_installation_uuid',
                    'installation_uuid',
                    'organization_uuid',
                    'user_uuid',
                    'environment',
                ]);

            return {
                mobilePushInstallationUuid: row.mobile_push_installation_uuid,
                installationUuid: row.installation_uuid,
                organizationUuid: row.organization_uuid,
                userUuid: row.user_uuid,
                environment: row.environment,
            };
        });
    }

    async deleteInstallation(args: {
        installationUuid: string;
        organizationUuid: string;
        userUuid: string;
    }): Promise<void> {
        await this.database<DbMobilePushInstallation>(
            MobilePushInstallationsTableName,
        )
            .where({
                installation_uuid: args.installationUuid,
                organization_uuid: args.organizationUuid,
                user_uuid: args.userUuid,
            })
            .delete();
    }

    async upsertLiveActivity(args: {
        liveActivityUuid: string;
        mobilePushInstallationUuid: string;
        organizationUuid: string;
        userUuid: string;
        projectUuid: string;
        agentUuid: string;
        threadUuid: string;
        promptUuid: string;
        pushToken: string;
    }): Promise<void> {
        const fingerprint = tokenFingerprint(args.pushToken);
        const encryptedPushToken = this.encryptionUtil.encrypt(args.pushToken);

        await this.database.transaction(async (trx) => {
            await trx<DbAiAgentLiveActivity>(AiAgentLiveActivitiesTableName)
                .where('push_token_fingerprint', fingerprint)
                .whereNot('live_activity_uuid', args.liveActivityUuid)
                .delete();

            await trx<DbAiAgentLiveActivity>(AiAgentLiveActivitiesTableName)
                .insert({
                    live_activity_uuid: args.liveActivityUuid,
                    mobile_push_installation_uuid:
                        args.mobilePushInstallationUuid,
                    organization_uuid: args.organizationUuid,
                    user_uuid: args.userUuid,
                    project_uuid: args.projectUuid,
                    agent_uuid: args.agentUuid,
                    thread_uuid: args.threadUuid,
                    prompt_uuid: args.promptUuid,
                    encrypted_push_token: encryptedPushToken,
                    push_token_fingerprint: fingerprint,
                })
                .onConflict('live_activity_uuid')
                .merge({
                    mobile_push_installation_uuid:
                        args.mobilePushInstallationUuid,
                    organization_uuid: args.organizationUuid,
                    user_uuid: args.userUuid,
                    project_uuid: args.projectUuid,
                    agent_uuid: args.agentUuid,
                    thread_uuid: args.threadUuid,
                    prompt_uuid: args.promptUuid,
                    encrypted_push_token: encryptedPushToken,
                    push_token_fingerprint: fingerprint,
                    ended_at: null,
                    completion_alert_completed_at: null,
                    updated_at: new Date(),
                });
        });
    }

    async findLiveActivityOwner(liveActivityUuid: string): Promise<
        | {
              liveActivityUuid: string;
              mobilePushInstallationUuid: string;
              organizationUuid: string;
              userUuid: string;
              projectUuid: string;
              agentUuid: string;
              threadUuid: string;
              promptUuid: string;
          }
        | undefined
    > {
        return this.database<DbAiAgentLiveActivity>(
            AiAgentLiveActivitiesTableName,
        )
            .select({
                liveActivityUuid: 'live_activity_uuid',
                mobilePushInstallationUuid: 'mobile_push_installation_uuid',
                organizationUuid: 'organization_uuid',
                userUuid: 'user_uuid',
                projectUuid: 'project_uuid',
                agentUuid: 'agent_uuid',
                threadUuid: 'thread_uuid',
                promptUuid: 'prompt_uuid',
            })
            .where('live_activity_uuid', liveActivityUuid)
            .first();
    }

    async findLiveActivity(
        liveActivityUuid: string,
    ): Promise<AiAgentLiveActivity | undefined> {
        const row = await this.database<DbAiAgentLiveActivity>(
            AiAgentLiveActivitiesTableName,
        )
            .join<DbMobilePushInstallation>(
                MobilePushInstallationsTableName,
                `${AiAgentLiveActivitiesTableName}.mobile_push_installation_uuid`,
                `${MobilePushInstallationsTableName}.mobile_push_installation_uuid`,
            )
            .select({
                liveActivityUuid: `${AiAgentLiveActivitiesTableName}.live_activity_uuid`,
                mobilePushInstallationUuid: `${AiAgentLiveActivitiesTableName}.mobile_push_installation_uuid`,
                installationUuid: `${MobilePushInstallationsTableName}.installation_uuid`,
                organizationUuid: `${AiAgentLiveActivitiesTableName}.organization_uuid`,
                userUuid: `${AiAgentLiveActivitiesTableName}.user_uuid`,
                projectUuid: `${AiAgentLiveActivitiesTableName}.project_uuid`,
                agentUuid: `${AiAgentLiveActivitiesTableName}.agent_uuid`,
                threadUuid: `${AiAgentLiveActivitiesTableName}.thread_uuid`,
                promptUuid: `${AiAgentLiveActivitiesTableName}.prompt_uuid`,
                environment: `${MobilePushInstallationsTableName}.environment`,
                encryptedDeviceToken: `${MobilePushInstallationsTableName}.encrypted_device_token`,
                encryptedPushToken: `${AiAgentLiveActivitiesTableName}.encrypted_push_token`,
                lastDeliveredState: `${AiAgentLiveActivitiesTableName}.last_delivered_state`,
                lastDeliveredStateChangedAt: `${AiAgentLiveActivitiesTableName}.last_delivered_state_changed_at`,
                staleAt: `${AiAgentLiveActivitiesTableName}.stale_at`,
                endedAt: `${AiAgentLiveActivitiesTableName}.ended_at`,
                completionAlertCompletedAt: `${AiAgentLiveActivitiesTableName}.completion_alert_completed_at`,
            })
            .where(
                `${AiAgentLiveActivitiesTableName}.live_activity_uuid`,
                liveActivityUuid,
            )
            .first();

        if (row === undefined) return undefined;
        return {
            liveActivityUuid: row.liveActivityUuid,
            mobilePushInstallationUuid: row.mobilePushInstallationUuid,
            installationUuid: row.installationUuid,
            organizationUuid: row.organizationUuid,
            userUuid: row.userUuid,
            projectUuid: row.projectUuid,
            agentUuid: row.agentUuid,
            threadUuid: row.threadUuid,
            promptUuid: row.promptUuid,
            environment: row.environment,
            deviceToken: this.encryptionUtil.decrypt(row.encryptedDeviceToken),
            pushToken: this.encryptionUtil.decrypt(row.encryptedPushToken),
            lastDeliveredState: row.lastDeliveredState,
            lastDeliveredStateChangedAt: row.lastDeliveredStateChangedAt,
            staleAt: row.staleAt,
            endedAt: row.endedAt,
            completionAlertCompletedAt: row.completionAlertCompletedAt,
        };
    }

    async findActiveLiveActivitiesForThread(threadUuid: string): Promise<
        {
            liveActivityUuid: string;
            organizationUuid: string;
            projectUuid: string;
            userUuid: string;
        }[]
    > {
        return this.database<DbAiAgentLiveActivity>(
            AiAgentLiveActivitiesTableName,
        )
            .select({
                liveActivityUuid: 'live_activity_uuid',
                organizationUuid: 'organization_uuid',
                projectUuid: 'project_uuid',
                userUuid: 'user_uuid',
            })
            .where('thread_uuid', threadUuid)
            .whereNull('ended_at');
    }

    async findLiveActivitiesDueForReconciliation(
        dueBefore: Date,
        limit: number,
    ): Promise<
        {
            liveActivityUuid: string;
            organizationUuid: string;
            projectUuid: string;
            userUuid: string;
        }[]
    > {
        return this.database<DbAiAgentLiveActivity>(
            AiAgentLiveActivitiesTableName,
        )
            .select({
                liveActivityUuid: 'live_activity_uuid',
                organizationUuid: 'organization_uuid',
                projectUuid: 'project_uuid',
                userUuid: 'user_uuid',
            })
            .whereNull('ended_at')
            .andWhere((query) =>
                query
                    .whereNull('stale_at')
                    .orWhere('stale_at', '<=', dueBefore),
            )
            .orderBy('stale_at', 'asc', 'first')
            .limit(limit);
    }

    async markLiveActivityDelivered(args: {
        liveActivityUuid: string;
        state: NonNullable<DbAiAgentLiveActivity['last_delivered_state']>;
        stateChangedAt: Date;
        staleAt: Date;
        endedAt: Date | null;
    }): Promise<void> {
        await this.database<DbAiAgentLiveActivity>(
            AiAgentLiveActivitiesTableName,
        )
            .where('live_activity_uuid', args.liveActivityUuid)
            .update({
                last_delivered_state: args.state,
                last_delivered_state_changed_at: args.stateChangedAt,
                last_delivered_at: new Date(),
                stale_at: args.staleAt,
                ended_at: args.endedAt,
                updated_at: new Date(),
            });
    }

    async markCompletionAlertCompleted(
        liveActivityUuid: string,
    ): Promise<void> {
        await this.database<DbAiAgentLiveActivity>(
            AiAgentLiveActivitiesTableName,
        )
            .where('live_activity_uuid', liveActivityUuid)
            .update({
                completion_alert_completed_at: new Date(),
                updated_at: new Date(),
            });
    }

    async deleteLiveActivity(args: {
        liveActivityUuid: string;
        installationUuid?: string;
        organizationUuid?: string;
        userUuid?: string;
        projectUuid?: string;
        agentUuid?: string;
        threadUuid?: string;
    }): Promise<void> {
        const query = this.database<DbAiAgentLiveActivity>(
            AiAgentLiveActivitiesTableName,
        ).where('live_activity_uuid', args.liveActivityUuid);

        if (args.organizationUuid !== undefined) {
            query.where('organization_uuid', args.organizationUuid);
        }
        if (args.userUuid !== undefined) {
            query.where('user_uuid', args.userUuid);
        }
        if (args.projectUuid !== undefined) {
            query.where('project_uuid', args.projectUuid);
        }
        if (args.agentUuid !== undefined) {
            query.where('agent_uuid', args.agentUuid);
        }
        if (args.threadUuid !== undefined) {
            query.where('thread_uuid', args.threadUuid);
        }
        if (args.installationUuid !== undefined) {
            query.whereIn(
                'mobile_push_installation_uuid',
                this.database<DbMobilePushInstallation>(
                    MobilePushInstallationsTableName,
                )
                    .select('mobile_push_installation_uuid')
                    .where('installation_uuid', args.installationUuid),
            );
        }

        await query.delete();
    }
}
