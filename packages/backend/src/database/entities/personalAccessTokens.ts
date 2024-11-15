import { Knex } from 'knex';

export type DbPersonalAccessToken = {
    personal_access_token_uuid: string;
    token_hash: string;
    created_by_user_id: number;
    created_at: Date;
    rotated_at: Date | null;
    last_used_at: Date | null;
    description: string;
    expires_at: Date | null;
};

type DbCreatePersonalAccessToken = Omit<
    DbPersonalAccessToken,
    'personal_access_token_uuid' | 'created_at' | 'rotated_at' | 'last_used_at'
>;

type DbRotatePersonalAccessToken = {
    token_hash: string;
    rotated_at: Date;
    expires_at: Date;
};

type DbUpdateUsedDatePersonalAccessToken = {
    last_used_at: Date;
};

export type PersonalAccessTokenTable = Knex.CompositeTableType<
    DbPersonalAccessToken,
    DbCreatePersonalAccessToken,
    DbRotatePersonalAccessToken | DbUpdateUsedDatePersonalAccessToken
>;
export const PersonalAccessTokenTableName = 'personal_access_tokens';
