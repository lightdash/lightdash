import { type AgentCapability } from './agentPermissions';
import {
    type AiAccessRefusal,
    type AiAccessRefusalReason,
} from './aiPrincipal';
import { type OrganizationMemberRole } from './organizationMemberProfile';
import { type ProjectMemberRole } from './projectMemberRole';

type PolicyLayer = NonNullable<AiAccessRefusal['policyLayer']>;

export type AgentPermissionCheckStatus =
    | 'allowed'
    | 'refused'
    | 'setup_needed'
    | 'not_checked';
export type AgentPermissionCheckKind =
    | 'person_permission'
    | 'agent_admission'
    | 'human_only'
    | 'agent_enabled'
    | 'operation_mapping'
    | 'project_scope'
    | 'capability'
    | 'content_writes'
    | 'warehouse_confirmation'
    | 'connection_grant'
    | 'warehouse_access';

export type AgentCapabilitySourceAssignment = {
    role:
        | { kind: 'system'; role: OrganizationMemberRole | ProjectMemberRole }
        | { kind: 'custom'; roleUuid: string; name: string | null };
    assignment:
        | 'organization'
        | 'project_user'
        | 'project_group'
        | 'extra_organization';
    projectUuid: string | null;
    groupUuid: string | null;
};

export type AgentPermissionCheck = {
    id: string;
    kind: AgentPermissionCheckKind;
    status: AgentPermissionCheckStatus;
    label: string;
    message: string;
    capability: AgentCapability | null;
    reason: AiAccessRefusalReason | null;
    policyLayer: PolicyLayer | null;
    settingsUrl: string | null;
    sourceAssignments: AgentCapabilitySourceAssignment[];
};

export type AgentPermissionBlocker = {
    checkId: string;
    status: 'refused' | 'setup_needed';
    reason: AiAccessRefusalReason;
    capability: AgentCapability | null;
    policyLayer: PolicyLayer | null;
    message: string;
    settingsUrl: string | null;
};

export type AgentPermissionExplanation = {
    mode: 'legacy' | 'managed';
    policyVersion: number;
    actionId: string;
    requiredCapabilities: AgentCapability[];
    result: AgentPermissionCheckStatus;
    allowedByCheckedPermissionsOnly: boolean;
    mainReason: AiAccessRefusal | null;
    policyMainReason: AiAccessRefusal | null;
    checks: AgentPermissionCheck[];
    blockers: AgentPermissionBlocker[];
    coverage: 'checked_permissions_only';
    warehouseAccess: 'not_verified';
    connectionGrant: 'not_checked_yet';
};
