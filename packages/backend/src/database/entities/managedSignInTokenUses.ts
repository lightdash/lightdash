import { Knex } from 'knex';

export type DbManagedSignInTokenUse = {
    token_hash: string;
    expires_at: Date;
    created_at: Date;
};

type DbManagedSignInTokenUseIn = Pick<
    DbManagedSignInTokenUse,
    'token_hash' | 'expires_at'
>;

export type ManagedSignInTokenUsesTable = Knex.CompositeTableType<
    DbManagedSignInTokenUse,
    DbManagedSignInTokenUseIn
>;

export const ManagedSignInTokenUsesTableName = 'managed_sign_in_token_uses';
