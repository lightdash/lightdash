import { Knex } from 'knex';

export const ContentReviewSettingsTableName = 'content_review_settings';

export type DbContentReviewSettings = {
    project_uuid: string;
    reviewer_group_uuid: string | null;
    verify_on_approve_default: boolean;
    slack_channel_id: string | null;
    created_at: Date;
    updated_at: Date;
};

export type CreateDbContentReviewSettings = Pick<
    DbContentReviewSettings,
    | 'project_uuid'
    | 'reviewer_group_uuid'
    | 'verify_on_approve_default'
    | 'slack_channel_id'
>;

export type UpdateDbContentReviewSettings = Partial<
    Pick<
        DbContentReviewSettings,
        | 'reviewer_group_uuid'
        | 'verify_on_approve_default'
        | 'slack_channel_id'
        | 'updated_at'
    >
>;

export type ContentReviewSettingsTable = Knex.CompositeTableType<
    DbContentReviewSettings,
    CreateDbContentReviewSettings,
    UpdateDbContentReviewSettings
>;
