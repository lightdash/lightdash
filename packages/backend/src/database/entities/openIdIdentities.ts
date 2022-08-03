import { Knex } from 'knex';

export type DbOpenIdIdentity = {
    issuer: string;
    issuer_type: 'google' | 'okta';
    subject: string;
    user_id: number;
    created_at: Date;
    email: string;
};

export const OpenIdIdentitiesTableName = 'openid_identities';

export type OpenIdIdentitiesTable = Knex.CompositeTableType<
    DbOpenIdIdentity,
    Omit<DbOpenIdIdentity, 'created_at'>
>;
