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
