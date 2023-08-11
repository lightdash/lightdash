import { OpenIdIdentityIssuerType } from '@lightdash/common';
import { Knex } from 'knex';

export type DbOpenIdIdentity = {
    issuer: string;
    issuer_type: OpenIdIdentityIssuerType;
    subject: string;
    user_id: number;
    created_at: Date;
    email: string;
    refresh_token?: string;
};

export const OpenIdIdentitiesTableName = 'openid_identities';

export type OpenIdIdentitiesTable = Knex.CompositeTableType<
    DbOpenIdIdentity,
    Omit<DbOpenIdIdentity, 'created_at'>
>;
