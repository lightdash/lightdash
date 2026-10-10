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
    version?: number;
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

export interface AgentCapabilityCeiling extends Pick<
    AgentCapabilityPolicy,
    'systemRoleMatrix' | 'allowedProjectUuids'
> {
    version?: number;
    allowedUserUuids?: string[] | null;
}

export type AgentPilotSelection = Pick<
    AgentCapabilityCeiling,
    'version' | 'allowedProjectUuids' | 'allowedUserUuids'
>;

export interface AgentWarehouseConfirmationStatus {
    confirmation: AgentWarehouseRestrictionConfirmation | null;
    confirmed: boolean;
}
