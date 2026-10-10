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
    systemRoleMatrix: AgentSystemRoleMatrix;
}

export interface AgentCapabilityPolicySave extends Omit<
    AgentCapabilityPolicy,
    'version'
> {
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
    pilotPreset: {
        description: string;
        systemRoleMatrix: AgentSystemRoleMatrix;
    };
}

export type AgentCapabilityCeiling = Pick<
    AgentCapabilityPolicy,
    'systemRoleMatrix' | 'allowedProjectUuids' | 'allowedUserUuids'
>;

export type AgentPilotSelection = Pick<
    AgentCapabilityCeiling,
    'allowedProjectUuids' | 'allowedUserUuids'
>;

export interface AgentWarehouseConfirmationStatus {
    confirmation: AgentWarehouseRestrictionConfirmation | null;
    confirmed: boolean;
}
