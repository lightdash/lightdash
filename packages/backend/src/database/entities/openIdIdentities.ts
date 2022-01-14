import { Knex } from 'knex';

export type DbOpenIdIdentity = {
    issuer: string;
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

export const OpenIdIssuersTableName = 'openid_issuers';
export type DbOpenIdIssuer = {
    issuer: 'https://accounts.google.com';
};
export type OpenIdIssuersTable = Knex.CompositeTableType<DbOpenIdIssuer>;
