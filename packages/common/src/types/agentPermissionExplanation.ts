import { type AgentCapability } from './agentPermissions';
import {
    type AiAccessRefusal,
    type AiAccessRefusalReason,
} from './aiPrincipal';

type PolicyLayer = NonNullable<AiAccessRefusal['policyLayer']>;

export type AgentPermissionCheckStatus =
    | 'allowed'
    | 'refused'
    | 'setup_needed'
    | 'not_checked';
export type AgentPermissionCheckKind =
    | 'agent_admission'
    | 'human_only'
    | 'agent_enabled'
    | 'operation_mapping'
    | 'project_scope'
    | 'capability'
    | 'content_writes'
    | 'warehouse_confirmation';

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
