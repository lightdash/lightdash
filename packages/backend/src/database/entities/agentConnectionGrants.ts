import { type AgentConnectionGrant } from '@lightdash/common';
import { type Knex } from 'knex';

export const AgentConnectionGrantsTableName = 'agent_connection_grants';

export interface DbAgentConnectionGrant {
    agent_connection_grant_uuid: string;
    organization_uuid: string;
    subject_user_uuid: string;
    client_id: string;
    credential_kind: AgentConnectionGrant['credentialKind'];
    actor_kind: AgentConnectionGrant['actorKind'];
    name: string;
    resource: string;
    refresh_family_uuid: string | null;
    approved_capabilities: AgentConnectionGrant['approvedCapabilities'];
    approved_project_uuids: string[];
    resource_constraints: AgentConnectionGrant['resourceConstraints'];
    grant_contract_version: number;
    grant_revision: number;
    approval_policy_version: number | null;
    approved_by_user_uuid: string | null;
    approval_method: AgentConnectionGrant['approvalMethod'];
    approved_at: Date;
    approval_request_uuid: string | null;
    expires_at: Date;
    revoked_at: Date | null;
    revoked_by_user_uuid: string | null;
    revocation_reason: string | null;
    replaced_by_grant_uuid: string | null;
    created_at: Date;
    last_used_at: Date | null;
}

type DefaultedColumns =
    | 'agent_connection_grant_uuid'
    | 'refresh_family_uuid'
    | 'resource_constraints'
    | 'grant_revision'
    | 'approval_policy_version'
    | 'approved_by_user_uuid'
    | 'approved_at'
    | 'approval_request_uuid'
    | 'revoked_at'
    | 'revoked_by_user_uuid'
    | 'revocation_reason'
    | 'replaced_by_grant_uuid'
    | 'created_at'
    | 'last_used_at';

export type DbAgentConnectionGrantInsert = Omit<
    DbAgentConnectionGrant,
    DefaultedColumns
> &
    Partial<Pick<DbAgentConnectionGrant, DefaultedColumns>>;

export type AgentConnectionGrantsTable = Knex.CompositeTableType<
    DbAgentConnectionGrant,
    DbAgentConnectionGrantInsert,
    Knex.DbRecord<
        Pick<
            DbAgentConnectionGrant,
            | 'refresh_family_uuid'
            | 'revoked_at'
            | 'revoked_by_user_uuid'
            | 'revocation_reason'
            | 'replaced_by_grant_uuid'
            | 'last_used_at'
        >
    >
>;
