import { Knex } from 'knex';

export type DbPersonalAccessToken = {
    personal_access_token_uuid: string;
    token_hash: string;
    created_by_user_id: number;
    created_at: Date;
    description: string;
    expires_at: Date | undefined;
};

type DbCreatePersonalAccessToken = Omit<
    DbPersonalAccessToken,
    'personal_access_token_uuid' | 'created_at'
>;
export type PersonalAccessTokenTable = Knex.CompositeTableType<
    DbPersonalAccessToken,
    DbCreatePersonalAccessToken
>;
export const PersonalAccessTokenTableName = 'personal_access_tokens';
