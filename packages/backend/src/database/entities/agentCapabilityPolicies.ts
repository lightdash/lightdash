import {
    type AgentCapability,
    type AgentCapabilityPolicy,
    type OrganizationMemberRole,
} from '@lightdash/common';
import { type Knex } from 'knex';

export const AgentCapabilityPoliciesTableName =
    'organization_agent_capability_policies';
export const AgentSystemRoleCapabilitiesTableName =
    'organization_agent_system_role_capabilities';

export interface DbAgentCapabilityPolicy {
    organization_uuid: string;
    mode: AgentCapabilityPolicy['mode'];
    version: number;
    allowed_project_uuids: string[] | null;
    updated_by_user_uuid: string | null;
    created_at: Date;
    updated_at: Date;
}

export interface DbAgentCapabilityPolicyInsert extends Omit<
    DbAgentCapabilityPolicy,
    'created_at' | 'updated_at'
> {}

export type AgentCapabilityPoliciesTable = Knex.CompositeTableType<
    DbAgentCapabilityPolicy,
    DbAgentCapabilityPolicyInsert,
    Partial<DbAgentCapabilityPolicy>
>;

export interface DbAgentSystemRoleCapability {
    organization_uuid: string;
    system_role: OrganizationMemberRole;
    capability: AgentCapability;
}

export type AgentSystemRoleCapabilitiesTable =
    Knex.CompositeTableType<DbAgentSystemRoleCapability>;
