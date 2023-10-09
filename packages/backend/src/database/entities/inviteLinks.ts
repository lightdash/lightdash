import { Knex } from 'knex';

export type DbInviteLink = {
    invite_code_hash: string;
    organization_id: number;
    user_uuid: string;
    created_at: Date;
    expires_at: Date;
};

type DbInviteLinkInsert = Pick<
    DbInviteLink,
    'organization_id' | 'invite_code_hash' | 'expires_at' | 'user_uuid'
>;
type DbInviteLinkUpdate = {};

export type InviteLinkTable = Knex.CompositeTableType<
    DbInviteLink,
    DbInviteLinkInsert,
    DbInviteLinkUpdate
>;

export const InviteLinkTableName = 'invite_links';
