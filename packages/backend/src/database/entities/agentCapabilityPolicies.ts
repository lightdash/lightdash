import {
    type AgentCapability,
    type OrganizationMemberRole,
} from '@lightdash/common';
import { type Knex } from 'knex';

export const AgentCapabilityPoliciesTableName =
    'organization_agent_capability_policies';
export const AgentSystemRoleCapabilitiesTableName =
    'organization_agent_system_role_capabilities';

export interface DbAgentCapabilityPolicy {
    organization_uuid: string;
    version: number;
    allowed_capabilities: AgentCapability[] | null;
    allowed_project_uuids: string[] | null;
    allowed_user_uuids: string[] | null;
    allowed_group_uuids: string[] | null;
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

export const ProjectAgentCapabilityPoliciesTableName =
    'project_agent_capability_policies';

export interface DbProjectAgentCapabilityPolicy {
    project_uuid: string;
    allowed_capabilities: AgentCapability[] | null;
    updated_by_user_uuid: string | null;
    created_at: Date;
    updated_at: Date;
}

export type ProjectAgentCapabilityPoliciesTable = Knex.CompositeTableType<
    DbProjectAgentCapabilityPolicy,
    Omit<DbProjectAgentCapabilityPolicy, 'created_at' | 'updated_at'>,
    Partial<DbProjectAgentCapabilityPolicy>
>;

export interface DbAgentSystemRoleCapability {
    organization_uuid: string;
    system_role: OrganizationMemberRole;
    capability: AgentCapability;
}

export type AgentSystemRoleCapabilitiesTable =
    Knex.CompositeTableType<DbAgentSystemRoleCapability>;
