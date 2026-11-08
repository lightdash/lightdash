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
}
export interface AgentCapabilityPolicyOverview extends AgentCapabilityPolicy {
    groupsAvailable: boolean;
}
export interface AgentCapabilityCeiling {
    version?: number;
    mode?: 'legacy' | 'managed';
    allowedCapabilities?: AgentCapability[] | null;
    allowedGroupUuids?: string[] | null;
    /**
     * Deprecated. Per-role limits are no longer applied. Accepted for compatibility, ignored, and removed in a later release.
     * @deprecated
     */
    systemRoleMatrix?: AgentSystemRoleMatrix;
}
export interface AgentCapabilityPolicyResult extends AgentCapabilityPolicy {
    /**
     * Deprecated. Per-role limits are no longer applied. Returned for compatibility and removed in a later release.
     * @deprecated
     */
    systemRoleMatrix: AgentSystemRoleMatrix;
}
export interface AgentCapabilityPolicyOverviewResult extends AgentCapabilityPolicyOverview {
    /**
     * Deprecated. Per-role limits are no longer applied. Returned for compatibility and removed in a later release.
     * @deprecated
     */
    systemRoleMatrix: AgentSystemRoleMatrix;
    /**
     * Deprecated. Per-role limits are no longer applied. Returned for compatibility and removed in a later release.
     * @deprecated
     */
    defaults: AgentSystemRoleMatrix;
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
    results: AgentCapabilityPolicyResult;
}
export interface AgentPolicyOverviewResponse extends Omit<
    AgentPolicyResponse,
    'results'
> {
    results: AgentCapabilityPolicyOverviewResult;
}
