import { type AgentCapability } from './agentPermissions';

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

/**
 * A project's own agent restrictions. When a project has one, it replaces the
 * organization's restrictions for that project.
 */
export interface AgentProjectCapabilityPolicy {
    projectUuid: string;
    /** Null means agents have no restrictions in this project. */
    allowedCapabilities: AgentCapability[] | null;
}
export interface AgentProjectCapabilityPolicySave {
    /** Null means agents have no restrictions in this project. */
    allowedCapabilities: AgentCapability[] | null;
}
export interface AgentProjectPoliciesResponse extends AgentPolicyResponseBase {
    results: AgentProjectCapabilityPolicy[];
}
export interface AgentProjectPolicyResponse extends AgentPolicyResponseBase {
    results: AgentProjectCapabilityPolicy;
}
