import { type AiAgentThreadLiveStatus } from '@lightdash/common';
import { Knex } from 'knex';

export const MobilePushInstallationsTableName = 'mobile_push_installations';
export const AiAgentLiveActivitiesTableName = 'ai_agent_live_activities';
export const AiAgentLiveActivityStartAttemptsTableName =
    'ai_agent_live_activity_start_attempts';

export type MobilePushEnvironment = 'sandbox' | 'production';

export type MobilePushPlatform = 'ios' | 'android';

export type LiveActivityStartAttemptStatus =
    | 'excluded'
    | 'pending'
    | 'processing'
    | 'retryable'
    | 'sent'
    | 'failed';

export type DbMobilePushInstallation = {
    mobile_push_installation_uuid: string;
    installation_uuid: string;
    organization_uuid: string;
    user_uuid: string;
    platform: MobilePushPlatform;
    environment: MobilePushEnvironment;
    encrypted_device_token: Buffer;
    device_token_fingerprint: string;
    encrypted_push_to_start_token: Buffer | null;
    push_to_start_token_fingerprint: string | null;
    oauth_client_id: string | null;
    created_at: Date;
    updated_at: Date;
};

export type MobilePushInstallationTable = Knex.CompositeTableType<
    DbMobilePushInstallation,
    Omit<
        DbMobilePushInstallation,
        | 'mobile_push_installation_uuid'
        | 'encrypted_push_to_start_token'
        | 'push_to_start_token_fingerprint'
        | 'oauth_client_id'
        | 'created_at'
        | 'updated_at'
    > &
        Partial<
            Pick<
                DbMobilePushInstallation,
                | 'encrypted_push_to_start_token'
                | 'push_to_start_token_fingerprint'
                | 'oauth_client_id'
            >
        >,
    Partial<
        Omit<
            DbMobilePushInstallation,
            'mobile_push_installation_uuid' | 'created_at'
        >
    >
>;

export type DbAiAgentLiveActivityStartAttempt = {
    live_activity_start_attempt_uuid: string;
    live_activity_uuid: string;
    mobile_push_installation_uuid: string;
    prompt_uuid: string;
    status: LiveActivityStartAttemptStatus;
    attempt_count: number;
    last_attempted_at: Date | null;
    last_token_fingerprint: string | null;
    completed_at: Date | null;
    created_at: Date;
    updated_at: Date;
};

export type AiAgentLiveActivityStartAttemptTable = Knex.CompositeTableType<
    DbAiAgentLiveActivityStartAttempt,
    Pick<
        DbAiAgentLiveActivityStartAttempt,
        'mobile_push_installation_uuid' | 'prompt_uuid' | 'status'
    > &
        Partial<
            Pick<
                DbAiAgentLiveActivityStartAttempt,
                'completed_at' | 'live_activity_uuid'
            >
        >,
    Partial<
        Pick<
            DbAiAgentLiveActivityStartAttempt,
            | 'status'
            | 'last_attempted_at'
            | 'last_token_fingerprint'
            | 'completed_at'
            | 'updated_at'
        >
    > & { attempt_count?: number | Knex.Raw }
>;

export type DbAiAgentLiveActivity = {
    live_activity_uuid: string;
    mobile_push_installation_uuid: string;
    organization_uuid: string;
    user_uuid: string;
    project_uuid: string;
    agent_uuid: string;
    thread_uuid: string;
    prompt_uuid: string;
    encrypted_push_token: Buffer;
    push_token_fingerprint: string;
    last_delivered_state: AiAgentThreadLiveStatus['state'] | null;
    last_delivered_state_changed_at: Date | null;
    last_delivered_at: Date | null;
    stale_at: Date | null;
    ended_at: Date | null;
    completion_alert_completed_at: Date | null;
    created_at: Date;
    updated_at: Date;
};

export type AiAgentLiveActivityTable = Knex.CompositeTableType<
    DbAiAgentLiveActivity,
    Omit<
        DbAiAgentLiveActivity,
        | 'last_delivered_state'
        | 'last_delivered_state_changed_at'
        | 'last_delivered_at'
        | 'stale_at'
        | 'ended_at'
        | 'completion_alert_completed_at'
        | 'created_at'
        | 'updated_at'
    > &
        Partial<
            Pick<
                DbAiAgentLiveActivity,
                | 'last_delivered_state'
                | 'last_delivered_state_changed_at'
                | 'last_delivered_at'
                | 'stale_at'
                | 'ended_at'
                | 'completion_alert_completed_at'
            >
        >,
    Partial<Omit<DbAiAgentLiveActivity, 'live_activity_uuid' | 'created_at'>>
>;
