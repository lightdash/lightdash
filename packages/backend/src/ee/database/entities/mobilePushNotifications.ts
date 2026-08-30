import { type AiAgentThreadLiveStatus } from '@lightdash/common';
import { Knex } from 'knex';

export const MobilePushInstallationsTableName = 'mobile_push_installations';
export const AiAgentLiveActivitiesTableName = 'ai_agent_live_activities';

export type MobilePushEnvironment = 'sandbox' | 'production';

export type DbMobilePushInstallation = {
    mobile_push_installation_uuid: string;
    installation_uuid: string;
    organization_uuid: string;
    user_uuid: string;
    environment: MobilePushEnvironment;
    encrypted_device_token: Buffer;
    device_token_fingerprint: string;
    created_at: Date;
    updated_at: Date;
};

export type MobilePushInstallationTable = Knex.CompositeTableType<
    DbMobilePushInstallation,
    Omit<
        DbMobilePushInstallation,
        'mobile_push_installation_uuid' | 'created_at' | 'updated_at'
    >,
    Partial<
        Omit<
            DbMobilePushInstallation,
            'mobile_push_installation_uuid' | 'created_at'
        >
    >
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
