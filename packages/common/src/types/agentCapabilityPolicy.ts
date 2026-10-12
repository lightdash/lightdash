import { type AgentCapability } from './agentPermissions';
import { type OrganizationMemberRole } from './organizationMemberProfile';

export type AgentSystemRoleMatrix = Record<
    OrganizationMemberRole,
    AgentCapability[]
>;

export interface AgentCapabilityPolicy {
    mode: 'legacy' | 'managed';
    version: number;
    allowedCapabilities: AgentCapability[] | null;
    allowedGroupUuids: string[] | null;
    systemRoleMatrix: AgentSystemRoleMatrix;
}
export interface AgentCapabilityPolicyOverview extends AgentCapabilityPolicy {
    defaults: AgentSystemRoleMatrix;
    groupsAvailable: boolean;
}
export interface AgentCapabilityCeiling extends Pick<
    AgentCapabilityPolicy,
    'systemRoleMatrix'
> {
    version?: number;
    mode?: 'legacy' | 'managed';
    allowedCapabilities?: AgentCapability[] | null;
    allowedGroupUuids?: string[] | null;
}
export interface AgentCapabilityPolicySave extends Omit<
    AgentCapabilityPolicy,
    'version' | 'allowedCapabilities' | 'allowedGroupUuids'
> {
    version?: number;
    allowedCapabilities?: AgentCapability[] | null;
    allowedGroupUuids?: string[] | null;
    organizationUuid: string;
    updatedByUserUuid: string | null;
}
export interface ResetPolicyRequest {
    version?: number;
}
export interface AgentPolicyResponseBase {
    status: 'ok';
}
export interface AgentPolicyResponse extends AgentPolicyResponseBase {
    results: AgentCapabilityPolicy;
}
export interface AgentPolicyOverviewResponse extends Omit<
    AgentPolicyResponse,
    'results'
> {
    results: AgentCapabilityPolicyOverview;
}
