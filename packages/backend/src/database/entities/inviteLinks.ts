import { InviteLinkPurpose } from '@lightdash/common';
import { Knex } from 'knex';

export type DbInviteLink = {
    invite_code_hash: string;
    organization_id: number;
    user_uuid: string;
    created_at: Date;
    expires_at: Date;
    purpose: InviteLinkPurpose;
};

type DbInviteLinkInsert = Pick<
    DbInviteLink,
    | 'organization_id'
    | 'invite_code_hash'
    | 'expires_at'
    | 'user_uuid'
    | 'purpose'
>;
type DbInviteLinkUpdate = {};

export type InviteLinkTable = Knex.CompositeTableType<
    DbInviteLink,
    DbInviteLinkInsert,
    DbInviteLinkUpdate
>;

export const InviteLinkTableName = 'invite_links';
