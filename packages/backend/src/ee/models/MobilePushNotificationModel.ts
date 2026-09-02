import { createHash } from 'crypto';
import { Knex } from 'knex';
import { type EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import { AiPromptTableName, AiThreadTableName } from '../database/entities/ai';
import {
    AiAgentLiveActivitiesTableName,
    AiAgentLiveActivityStartAttemptsTableName,
    MobilePushInstallationsTableName,
    type AiAgentLiveActivityStartAttemptTable,
    type DbAiAgentLiveActivity,
    type DbAiAgentLiveActivityStartAttempt,
    type DbMobilePushInstallation,
    type LiveActivityStartAttemptStatus,
    type MobilePushEnvironment,
    type MobilePushPlatform,
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
    platform: MobilePushPlatform;
    environment: MobilePushEnvironment;
};

export type UpsertInstallationResult =
    | { status: 'stored'; installation: MobilePushInstallation }
    | { status: 'owner_mismatch' };

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
    platform: MobilePushPlatform;
    environment: MobilePushEnvironment;
    deviceToken: string;
    pushToken: string;
    lastDeliveredState: DbAiAgentLiveActivity['last_delivered_state'];
    lastDeliveredStateChangedAt: Date | null;
    staleAt: Date | null;
    endedAt: Date | null;
    completionAlertCompletedAt: Date | null;
};

export type LiveActivityStartAttempt = {
    liveActivityStartAttemptUuid: string;
    liveActivityUuid: string;
    installationUuid: string;
    organizationUuid: string;
    userUuid: string;
    promptUuid: string;
    environment: MobilePushEnvironment;
    pushToStartToken: string | null;
    pushToStartTokenFingerprint: string | null;
    status: LiveActivityStartAttemptStatus;
    attemptCount: number;
};

export type SchedulableLiveActivityStartAttempt = {
    liveActivityStartAttemptUuid: string;
    installationUuid: string;
    organizationUuid: string;
    projectUuid: string;
    userUuid: string;
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
                platform: 'platform',
                environment: 'environment',
            })
            .where('installation_uuid', installationUuid)
            .first();
    }

    async upsertInstallation(args: {
        installationUuid: string;
        organizationUuid: string;
        userUuid: string;
        platform: MobilePushPlatform;
        environment: MobilePushEnvironment;
        deviceToken: string;
    }): Promise<UpsertInstallationResult> {
        const fingerprint = tokenFingerprint(args.deviceToken);
        const encryptedDeviceToken = this.encryptionUtil.encrypt(
            args.deviceToken,
        );

        return this.database.transaction(async (trx) => {
            await trx.raw(
                'SELECT pg_advisory_xact_lock(hashtextextended(?, 0))',
                [args.installationUuid],
            );
            const existing = await trx<DbMobilePushInstallation>(
                MobilePushInstallationsTableName,
            )
                .select(
                    'mobile_push_installation_uuid',
                    'organization_uuid',
                    'user_uuid',
                    'platform',
                    'environment',
                    'device_token_fingerprint',
                )
                .where('installation_uuid', args.installationUuid)
                .forUpdate()
                .first();

            const ownershipChanged =
                existing !== undefined &&
                (existing.organization_uuid !== args.organizationUuid ||
                    existing.user_uuid !== args.userUuid);

            if (
                ownershipChanged &&
                existing.device_token_fingerprint !== fingerprint
            ) {
                return { status: 'owner_mismatch' };
            }

            const environmentChanged =
                existing !== undefined &&
                (existing.environment !== args.environment ||
                    existing.platform !== args.platform);

            if (ownershipChanged && existing !== undefined) {
                await trx<DbAiAgentLiveActivity>(AiAgentLiveActivitiesTableName)
                    .where(
                        'mobile_push_installation_uuid',
                        existing.mobile_push_installation_uuid,
                    )
                    .delete();
            }

            if (
                (ownershipChanged || environmentChanged) &&
                existing !== undefined
            ) {
                await trx<DbAiAgentLiveActivityStartAttempt>(
                    AiAgentLiveActivityStartAttemptsTableName,
                )
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
                    platform: args.platform,
                    environment: args.environment,
                    encrypted_device_token: encryptedDeviceToken,
                    device_token_fingerprint: fingerprint,
                })
                .onConflict('installation_uuid')
                .merge({
                    organization_uuid: args.organizationUuid,
                    user_uuid: args.userUuid,
                    platform: args.platform,
                    environment: args.environment,
                    encrypted_device_token: encryptedDeviceToken,
                    device_token_fingerprint: fingerprint,
                    ...(ownershipChanged || environmentChanged
                        ? {
                              encrypted_push_to_start_token: null,
                              push_to_start_token_fingerprint: null,
                          }
                        : {}),
                    updated_at: new Date(),
                })
                .returning([
                    'mobile_push_installation_uuid',
                    'installation_uuid',
                    'organization_uuid',
                    'user_uuid',
                    'platform',
                    'environment',
                ]);

            return {
                status: 'stored',
                installation: {
                    mobilePushInstallationUuid:
                        row.mobile_push_installation_uuid,
                    installationUuid: row.installation_uuid,
                    organizationUuid: row.organization_uuid,
                    userUuid: row.user_uuid,
                    platform: row.platform,
                    environment: row.environment,
                },
            };
        });
    }

    async registerPushToStartToken(args: {
        installationUuid: string;
        organizationUuid: string;
        userUuid: string;
        environment: MobilePushEnvironment;
        pushToken: string;
    }): Promise<boolean> {
        const encryptedPushToken = this.encryptionUtil.encrypt(args.pushToken);
        const fingerprint = tokenFingerprint(args.pushToken);

        return this.database.transaction(async (trx) => {
            await trx.raw(
                'SELECT pg_advisory_xact_lock(hashtextextended(?, 0))',
                [`push-to-start:${fingerprint}`],
            );
            await trx.raw(
                'SELECT pg_advisory_xact_lock(hashtextextended(?, 0))',
                [args.installationUuid],
            );

            const target = await trx<DbMobilePushInstallation>(
                MobilePushInstallationsTableName,
            )
                .select('mobile_push_installation_uuid')
                .where({
                    installation_uuid: args.installationUuid,
                    organization_uuid: args.organizationUuid,
                    user_uuid: args.userUuid,
                    environment: args.environment,
                })
                .forUpdate()
                .first();
            if (target === undefined) return false;

            const conflicts = await trx<DbMobilePushInstallation>(
                MobilePushInstallationsTableName,
            )
                .select('mobile_push_installation_uuid')
                .where({
                    environment: args.environment,
                    push_to_start_token_fingerprint: fingerprint,
                })
                .whereNot('installation_uuid', args.installationUuid)
                .orderBy('installation_uuid', 'asc')
                .forUpdate();
            if (conflicts.length > 0) return false;

            const updated = await trx<DbMobilePushInstallation>(
                MobilePushInstallationsTableName,
            )
                .where({
                    installation_uuid: args.installationUuid,
                    organization_uuid: args.organizationUuid,
                    user_uuid: args.userUuid,
                    environment: args.environment,
                })
                .update({
                    encrypted_push_to_start_token: encryptedPushToken,
                    push_to_start_token_fingerprint: fingerprint,
                    updated_at: new Date(),
                });

            return updated > 0;
        });
    }

    async clearPushToStartTokenIfFingerprintMatches(args: {
        installationUuid: string;
        organizationUuid: string;
        userUuid: string;
        pushTokenFingerprint: string;
    }): Promise<boolean> {
        const updated = await this.database<DbMobilePushInstallation>(
            MobilePushInstallationsTableName,
        )
            .where({
                installation_uuid: args.installationUuid,
                organization_uuid: args.organizationUuid,
                user_uuid: args.userUuid,
                push_to_start_token_fingerprint: args.pushTokenFingerprint,
            })
            .update({
                encrypted_push_to_start_token: null,
                push_to_start_token_fingerprint: null,
                updated_at: new Date(),
            });

        return updated > 0;
    }

    async createLiveActivityStartAttempts(args: {
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
    > {
        if (args.environments.length === 0) return [];

        return this.database.transaction(async (trx) => {
            const candidateInstallations = await trx<DbMobilePushInstallation>(
                MobilePushInstallationsTableName,
            )
                .select('mobile_push_installation_uuid', 'installation_uuid')
                .where({
                    organization_uuid: args.organizationUuid,
                    user_uuid: args.userUuid,
                })
                .andWhere((candidates) => {
                    candidates.where((eligible) =>
                        eligible
                            .where('platform', 'ios')
                            .whereIn('environment', args.environments)
                            .whereNotNull('encrypted_push_to_start_token')
                            .whereNotNull('push_to_start_token_fingerprint'),
                    );
                    if (args.excludedMobilePushInstallationUuid !== null) {
                        void candidates.orWhere(
                            'mobile_push_installation_uuid',
                            args.excludedMobilePushInstallationUuid,
                        );
                    }
                })
                .orderBy('installation_uuid', 'asc')
                .forShare();

            const excludedInstallation =
                args.excludedMobilePushInstallationUuid === null
                    ? undefined
                    : candidateInstallations.find(
                          (installation) =>
                              installation.mobile_push_installation_uuid ===
                              args.excludedMobilePushInstallationUuid,
                      );
            const eligibleInstallations = candidateInstallations.filter(
                (installation) =>
                    installation.mobile_push_installation_uuid !==
                    args.excludedMobilePushInstallationUuid,
            );

            const rows: Array<
                Pick<
                    DbAiAgentLiveActivityStartAttempt,
                    'mobile_push_installation_uuid' | 'prompt_uuid' | 'status'
                > &
                    Partial<
                        Pick<DbAiAgentLiveActivityStartAttempt, 'completed_at'>
                    >
            > = [
                ...(excludedInstallation === undefined
                    ? []
                    : [
                          {
                              mobile_push_installation_uuid:
                                  excludedInstallation.mobile_push_installation_uuid,
                              prompt_uuid: args.promptUuid,
                              status: 'excluded' as const,
                              completed_at: new Date(),
                          },
                      ]),
                ...eligibleInstallations.map((installation) => ({
                    mobile_push_installation_uuid:
                        installation.mobile_push_installation_uuid,
                    prompt_uuid: args.promptUuid,
                    status: 'pending' as const,
                })),
            ];

            if (rows.length > 0) {
                await trx<AiAgentLiveActivityStartAttemptTable>(
                    AiAgentLiveActivityStartAttemptsTableName,
                )
                    .insert(rows)
                    .onConflict([
                        'mobile_push_installation_uuid',
                        'prompt_uuid',
                    ])
                    .ignore();
            }

            return trx<DbAiAgentLiveActivityStartAttempt>(
                AiAgentLiveActivityStartAttemptsTableName,
            )
                .join<DbMobilePushInstallation>(
                    MobilePushInstallationsTableName,
                    `${AiAgentLiveActivityStartAttemptsTableName}.mobile_push_installation_uuid`,
                    `${MobilePushInstallationsTableName}.mobile_push_installation_uuid`,
                )
                .select({
                    liveActivityStartAttemptUuid: `${AiAgentLiveActivityStartAttemptsTableName}.live_activity_start_attempt_uuid`,
                    installationUuid: `${MobilePushInstallationsTableName}.installation_uuid`,
                })
                .where(
                    `${AiAgentLiveActivityStartAttemptsTableName}.prompt_uuid`,
                    args.promptUuid,
                )
                .whereIn(
                    `${AiAgentLiveActivityStartAttemptsTableName}.status`,
                    ['pending', 'retryable'],
                )
                .where(
                    `${MobilePushInstallationsTableName}.organization_uuid`,
                    args.organizationUuid,
                )
                .where(
                    `${MobilePushInstallationsTableName}.user_uuid`,
                    args.userUuid,
                )
                .where(`${MobilePushInstallationsTableName}.platform`, 'ios')
                .whereIn(
                    `${MobilePushInstallationsTableName}.environment`,
                    args.environments,
                )
                .whereNotNull(
                    `${MobilePushInstallationsTableName}.encrypted_push_to_start_token`,
                )
                .whereNotNull(
                    `${MobilePushInstallationsTableName}.push_to_start_token_fingerprint`,
                )
                .orderBy(
                    `${MobilePushInstallationsTableName}.installation_uuid`,
                    'asc',
                );
        });
    }

    async claimLiveActivityStartAttempt(args: {
        liveActivityStartAttemptUuid: string;
        attemptedAt: Date;
        retryProcessingBefore: Date;
        maxAttempts: number;
    }): Promise<LiveActivityStartAttempt | undefined> {
        const claimed = await this.database<DbAiAgentLiveActivityStartAttempt>(
            AiAgentLiveActivityStartAttemptsTableName,
        )
            .where(
                'live_activity_start_attempt_uuid',
                args.liveActivityStartAttemptUuid,
            )
            .andWhere((query) =>
                query
                    .whereIn('status', ['pending', 'retryable'])
                    .orWhere((processing) =>
                        processing
                            .where('status', 'processing')
                            .where(
                                'last_attempted_at',
                                '<=',
                                args.retryProcessingBefore,
                            ),
                    ),
            )
            .where('attempt_count', '<', args.maxAttempts)
            .update({
                status: 'processing',
                attempt_count: this.database.raw('?? + 1', ['attempt_count']),
                last_attempted_at: args.attemptedAt,
                updated_at: args.attemptedAt,
            })
            .returning('live_activity_start_attempt_uuid');

        if (claimed.length === 0) return undefined;
        return this.findLiveActivityStartAttempt(
            args.liveActivityStartAttemptUuid,
        );
    }

    async findLiveActivityStartAttempt(
        liveActivityStartAttemptUuid: string,
    ): Promise<LiveActivityStartAttempt | undefined> {
        const row = await this.database<DbAiAgentLiveActivityStartAttempt>(
            AiAgentLiveActivityStartAttemptsTableName,
        )
            .join<DbMobilePushInstallation>(
                MobilePushInstallationsTableName,
                `${AiAgentLiveActivityStartAttemptsTableName}.mobile_push_installation_uuid`,
                `${MobilePushInstallationsTableName}.mobile_push_installation_uuid`,
            )
            .select({
                liveActivityStartAttemptUuid: `${AiAgentLiveActivityStartAttemptsTableName}.live_activity_start_attempt_uuid`,
                liveActivityUuid: `${AiAgentLiveActivityStartAttemptsTableName}.live_activity_uuid`,
                installationUuid: `${MobilePushInstallationsTableName}.installation_uuid`,
                organizationUuid: `${MobilePushInstallationsTableName}.organization_uuid`,
                userUuid: `${MobilePushInstallationsTableName}.user_uuid`,
                promptUuid: `${AiAgentLiveActivityStartAttemptsTableName}.prompt_uuid`,
                environment: `${MobilePushInstallationsTableName}.environment`,
                encryptedPushToStartToken: `${MobilePushInstallationsTableName}.encrypted_push_to_start_token`,
                pushToStartTokenFingerprint: `${MobilePushInstallationsTableName}.push_to_start_token_fingerprint`,
                status: `${AiAgentLiveActivityStartAttemptsTableName}.status`,
                attemptCount: `${AiAgentLiveActivityStartAttemptsTableName}.attempt_count`,
            })
            .where(
                `${AiAgentLiveActivityStartAttemptsTableName}.live_activity_start_attempt_uuid`,
                liveActivityStartAttemptUuid,
            )
            .first();

        if (row === undefined) return undefined;
        return {
            liveActivityStartAttemptUuid: row.liveActivityStartAttemptUuid,
            liveActivityUuid: row.liveActivityUuid,
            installationUuid: row.installationUuid,
            organizationUuid: row.organizationUuid,
            userUuid: row.userUuid,
            promptUuid: row.promptUuid,
            environment: row.environment,
            pushToStartToken:
                row.encryptedPushToStartToken === null
                    ? null
                    : this.encryptionUtil.decrypt(
                          row.encryptedPushToStartToken,
                      ),
            pushToStartTokenFingerprint: row.pushToStartTokenFingerprint,
            status: row.status,
            attemptCount: row.attemptCount,
        };
    }

    async markLiveActivityStartAttempt(args: {
        liveActivityStartAttemptUuid: string;
        status: Extract<
            LiveActivityStartAttemptStatus,
            'retryable' | 'sent' | 'failed'
        >;
        pushTokenFingerprint: string | null;
        completedAt: Date | null;
    }): Promise<boolean> {
        const updated = await this.database<DbAiAgentLiveActivityStartAttempt>(
            AiAgentLiveActivityStartAttemptsTableName,
        )
            .where(
                'live_activity_start_attempt_uuid',
                args.liveActivityStartAttemptUuid,
            )
            .where('status', 'processing')
            .update({
                status: args.status,
                last_token_fingerprint: args.pushTokenFingerprint,
                completed_at: args.completedAt,
                updated_at: new Date(),
            });

        return updated > 0;
    }

    async findLiveActivityStartAttemptsDue(args: {
        retryProcessingBefore: Date;
        environments: MobilePushEnvironment[];
        limit: number;
        maxAttempts: number;
    }): Promise<SchedulableLiveActivityStartAttempt[]> {
        if (args.environments.length === 0) return [];

        return this.database<DbAiAgentLiveActivityStartAttempt>(
            AiAgentLiveActivityStartAttemptsTableName,
        )
            .join<DbMobilePushInstallation>(
                MobilePushInstallationsTableName,
                `${AiAgentLiveActivityStartAttemptsTableName}.mobile_push_installation_uuid`,
                `${MobilePushInstallationsTableName}.mobile_push_installation_uuid`,
            )
            .join(
                AiPromptTableName,
                `${AiAgentLiveActivityStartAttemptsTableName}.prompt_uuid`,
                `${AiPromptTableName}.ai_prompt_uuid`,
            )
            .join(
                AiThreadTableName,
                `${AiPromptTableName}.ai_thread_uuid`,
                `${AiThreadTableName}.ai_thread_uuid`,
            )
            .select({
                liveActivityStartAttemptUuid: `${AiAgentLiveActivityStartAttemptsTableName}.live_activity_start_attempt_uuid`,
                installationUuid: `${MobilePushInstallationsTableName}.installation_uuid`,
                organizationUuid: `${AiThreadTableName}.organization_uuid`,
                projectUuid: `${AiThreadTableName}.project_uuid`,
                userUuid: `${AiPromptTableName}.created_by_user_uuid`,
            })
            .where((query) =>
                query
                    .whereIn(
                        `${AiAgentLiveActivityStartAttemptsTableName}.status`,
                        ['pending', 'retryable'],
                    )
                    .orWhere((processing) =>
                        processing
                            .where(
                                `${AiAgentLiveActivityStartAttemptsTableName}.status`,
                                'processing',
                            )
                            .where(
                                `${AiAgentLiveActivityStartAttemptsTableName}.last_attempted_at`,
                                '<=',
                                args.retryProcessingBefore,
                            ),
                    ),
            )
            .where(`${MobilePushInstallationsTableName}.platform`, 'ios')
            .whereIn(
                `${MobilePushInstallationsTableName}.environment`,
                args.environments,
            )
            .whereNotNull(
                `${MobilePushInstallationsTableName}.encrypted_push_to_start_token`,
            )
            .whereNotNull(
                `${MobilePushInstallationsTableName}.push_to_start_token_fingerprint`,
            )
            .where(
                `${AiAgentLiveActivityStartAttemptsTableName}.attempt_count`,
                '<',
                args.maxAttempts,
            )
            .whereRaw('?? = ??', [
                `${MobilePushInstallationsTableName}.organization_uuid`,
                `${AiThreadTableName}.organization_uuid`,
            ])
            .whereRaw('?? = ??', [
                `${MobilePushInstallationsTableName}.user_uuid`,
                `${AiPromptTableName}.created_by_user_uuid`,
            ])
            .orderBy(
                `${MobilePushInstallationsTableName}.installation_uuid`,
                'asc',
            )
            .limit(args.limit);
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
                platform: `${MobilePushInstallationsTableName}.platform`,
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
            platform: row.platform,
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
