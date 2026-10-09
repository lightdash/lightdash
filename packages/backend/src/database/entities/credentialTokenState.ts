import { type Knex } from 'knex';

export const CredentialTokenStateTableName = 'credential_token_state';

export type DbCredentialTokenState = {
    credential_uuid: string;
    encrypted_refresh_token: Buffer | null;
    refresh_expires_at: Date | null;
    version: string;
    rotated_at: Date | null;
    created_at: Date;
    updated_at: Date;
};

export type DbCredentialTokenStateInsert = Pick<
    DbCredentialTokenState,
    'credential_uuid'
> &
    Partial<DbCredentialTokenState>;

export type CredentialTokenStateTable = Knex.CompositeTableType<
    DbCredentialTokenState,
    DbCredentialTokenStateInsert,
    Knex.MaybeRawRecord<Partial<DbCredentialTokenStateInsert>>
>;
