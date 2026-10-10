import { type AgentCapability } from './agentPermissions';
import { type OrganizationMemberRole } from './organizationMemberProfile';

export type AgentSystemRoleMatrix = Record<
    OrganizationMemberRole,
    AgentCapability[]
>;

export interface AgentCapabilityPolicy {
    mode: 'legacy' | 'managed';
    version: number;
    allowedProjectUuids: string[] | null;
    allowedUserUuids: string[] | null;
    allowedGroupUuids: string[] | null;
    systemRoleMatrix: AgentSystemRoleMatrix;
}

export interface AgentCapabilityPolicySave extends Omit<
    AgentCapabilityPolicy,
    'version' | 'allowedUserUuids' | 'allowedGroupUuids'
> {
    version?: number;
    allowedUserUuids?: string[] | null;
    allowedGroupUuids?: string[] | null;
    organizationUuid: string;
    updatedByUserUuid: string | null;
}

export interface AgentWarehouseRestrictionConfirmation {
    projectUuid: string;
    bindingFingerprint: string;
    confirmedByUserUuid: string | null;
    confirmedAt: Date;
}

export interface AgentCapabilityPolicyOverview extends AgentCapabilityPolicy {
    defaults: AgentSystemRoleMatrix;
    groupsAvailable: boolean;
}

export interface AgentCapabilityCeiling extends Pick<
    AgentCapabilityPolicy,
    'systemRoleMatrix' | 'allowedProjectUuids'
> {
    version?: number;
    allowedUserUuids?: string[] | null;
    allowedGroupUuids?: string[] | null;
    mode?: 'legacy' | 'managed';
}

export type AgentAccessSelection = Pick<
    AgentCapabilityCeiling,
    'version' | 'allowedProjectUuids' | 'allowedUserUuids'
>;

export interface AgentWarehouseConfirmationStatus {
    confirmation: AgentWarehouseRestrictionConfirmation | null;
    confirmed: boolean;
}
