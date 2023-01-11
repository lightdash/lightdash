export const SlackAuthTokensTable = 'slack_auth_tokens';

export type DbSlackAuthTokens = {
    installation: any;
    organization_id: number;
    slack_team_id: string;
    created_by_user_id: number;
    created_at: Date;
};
