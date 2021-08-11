import { Knex } from 'knex';

type DbInviteLink = {
    invite_code_hash: string;
    organization_id: number;
    created_at: Date;
    expires_at: Date;
};

type DbInviteLinkInsert = Pick<
    DbInviteLink,
    'organization_id' | 'invite_code_hash' | 'expires_at'
>;
type DbInviteLinkUpdate = {};

export type InviteLinkTable = Knex.CompositeTableType<
    DbInviteLink,
    DbInviteLinkInsert,
    DbInviteLinkUpdate
>;
