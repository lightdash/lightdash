import {
    type AgentCapability,
    type AgentConnectionGrant,
} from '@lightdash/common';
import { type Knex } from 'knex';

export const AgentConnectionApprovalRequestsTableName =
    'agent_connection_approval_requests';

export type ApprovalSelection = Pick<
    AgentConnectionGrant,
    'approvedProjectUuids' | 'approvedCapabilities'
> & {
    resourceConstraints: Extract<
        AgentConnectionGrant['resourceConstraints'],
        { version: 2 }
    >;
};

export interface DbAgentConnectionApprovalRequest {
    agent_connection_approval_request_uuid: string;
    organization_uuid: string;
    subject_user_uuid: string;
    client_id: string;
    name: string;
    redirect_uri: string;
    state: string;
    code_challenge: string;
    resource: string;
    requested_projects: string[] | null;
    requested_capabilities: AgentCapability[];
    expires_in_seconds: number;
    created_at: Date;
    request_expires_at: Date;
    review_session_hash: Buffer | null;
    csrf_hash: Buffer | null;
    displayed_selection: ApprovalSelection | null;
    displayed_policy_version: number | null;
    review_revision: number;
    approved_selection: ApprovalSelection | null;
    approved_at: Date | null;
    approval_policy_version: number | null;
    decision_consumed_at: Date | null;
    callback_consumed_at: Date | null;
    terminal_error: 'agent_connections_unavailable' | 'access_denied' | null;
}

type ProtocolColumns =
    | 'organization_uuid'
    | 'subject_user_uuid'
    | 'client_id'
    | 'name'
    | 'redirect_uri'
    | 'state'
    | 'code_challenge'
    | 'resource'
    | 'expires_in_seconds';

type DbApprovalWrite = Omit<
    DbAgentConnectionApprovalRequest,
    'requested_projects' | 'requested_capabilities'
> & {
    requested_projects: string | null;
    requested_capabilities: string;
};

export type DbAgentConnectionApprovalRequestInsert = Knex.DbRecord<
    Pick<
        DbApprovalWrite,
        ProtocolColumns | 'requested_projects' | 'requested_capabilities'
    > &
        Partial<
            Omit<
                DbApprovalWrite,
                | ProtocolColumns
                | 'requested_projects'
                | 'requested_capabilities'
            >
        >
>;

export type AgentConnectionApprovalRequestsTable = Knex.CompositeTableType<
    DbAgentConnectionApprovalRequest,
    DbAgentConnectionApprovalRequestInsert,
    Knex.DbRecord<Partial<DbApprovalWrite>>
>;
