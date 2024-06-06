import { Installation } from '@slack/bolt';
import { Knex } from 'knex';

export const SlackAuthTokensTableName = 'slack_auth_tokens';

export type DbSlackAuthTokens = {
    installation: Installation;
    organization_id: number;
    slack_team_id: string;
    created_by_user_id: number;
    created_at: Date;
    notification_channel: string | null;
    app_name: string | null;
    app_profile_photo_url: string | null;
};

export type CreateDbSlackAuthTokens = Pick<
    DbSlackAuthTokens,
    'installation' | 'organization_id' | 'slack_team_id' | 'created_by_user_id'
>;

export type UpdateDbSlackAuthTokens = Pick<
    DbSlackAuthTokens,
    'notification_channel' | 'app_name' | 'app_profile_photo_url'
>;

export type SlackAuthTokensTable = Knex.CompositeTableType<
    DbSlackAuthTokens,
    CreateDbSlackAuthTokens,
    UpdateDbSlackAuthTokens
>;
