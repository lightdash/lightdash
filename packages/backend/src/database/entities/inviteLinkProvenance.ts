import { Knex } from 'knex';

export const InviteLinkProvenanceTableName = 'invite_link_provenance';

export type DbInviteLinkProvenance = {
    invite_code_hash: string;
    organization_uuid: string;
    inviter_user_uuid: string | null;
    invitee_email: string;
    created_at: Date;
    expires_at: Date;
    last_requested_at: Date | null;
};

export type InviteLinkProvenanceTable = Knex.CompositeTableType<
    DbInviteLinkProvenance,
    Omit<DbInviteLinkProvenance, 'created_at' | 'last_requested_at'>,
    Partial<DbInviteLinkProvenance>
>;
