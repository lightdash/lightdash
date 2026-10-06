import {
    type AiIdentitySchemaRule,
    type AiIdentityUngrantedSchemas,
} from './aiIdentitySchemaRule';

export enum AiIdentityCreationMode {
    GUIDED = 'guided',
    AUTOMATIC = 'automatic',
}

export enum AiIdentityProvisionerStatus {
    NOT_SET_UP = 'not_set_up',
    WAITING_FOR_SETUP = 'waiting_for_setup',
    READY = 'ready',
    FAILING = 'failing',
    REVOKED = 'revoked',
}

export const AI_IDENTITY_PROVISIONER_WORST_CASE =
    'The provisioning role can give AI-role access to users it creates. An AI role can give a person access to schemas that their own Snowflake role cannot read.';

export const AI_IDENTITY_SHOW_USERS_NOTICE =
    'Like any Snowflake role, it can list the names of the users in your account.';

export const DEFAULT_AI_IDENTITY_PROVISIONER_USER = 'LIGHTDASH_PROVISIONER';

export const DEFAULT_AI_IDENTITY_PROVISIONER_ROLE =
    'LIGHTDASH_PROVISIONER_ROLE';

export type AiIdentityProvisioner = {
    aiIdentityAccountUuid: string;
    userName: string;
    roleName: string;
    publicKey: string;
    publicKeyFingerprint: string;
    status: AiIdentityProvisionerStatus;
    statusMessage: string | null;
    checkedAt: Date | null;
    firstRunApprovedAt: Date | null;
    firstRunApprovedByName: string | null;
};

export type AiIdentityRoleMapping = {
    aiIdentityRoleMappingUuid: string;
    groupUuid: string;
    groupName: string;
    aiRole: string;
    priority: number;
};

export type AiIdentityAiRoleDefinition = {
    aiIdentityAiRoleUuid: string;
    roleName: string;
    warehouse: string;
    schemas: string[];
    schemaRule: AiIdentitySchemaRule;
};

export type UpdateAiIdentityAiRoleDefinition = {
    roleName: string;
    warehouse: string;
    schemas: string[];
    schemaRule?: AiIdentitySchemaRule;
};

export type CreateAiIdentityProvisioner = {
    userName: string;
    roleName: string;
};

export type UpdateAiIdentityRoleMapping = {
    groupUuid: string;
    aiRole: string;
    priority: number;
};

export type AiIdentityProvisioningOperation =
    | {
          kind: 'create_user';
          userName: string;
          publicKey: string;
          defaultRole: string;
          comment: string;
      }
    | { kind: 'set_public_key'; userName: string; publicKey: string }
    | { kind: 'set_default_role'; userName: string; role: string }
    | { kind: 'grant_role'; userName: string; role: string }
    | { kind: 'revoke_role'; userName: string; role: string }
    | { kind: 'drop_user'; userName: string };

export type AiIdentityProvisioningPlanItem = {
    aiIdentityUuid: string | null;
    email: string | null;
    operation: AiIdentityProvisioningOperation;
    sql: string;
};

export type AiIdentityProvisioningPlan = {
    items: AiIdentityProvisioningPlanItem[];
    skipped: { email: string; reason: string }[];
};

export enum AiIdentityProvisionerFindingReason {
    NOT_SERVICE_AGENT = 'not_service_agent',
    NOT_CREATED_BY_LIGHTDASH = 'not_created_by_lightdash',
}

export type AiIdentityProvisionerFinding = {
    userName: string;
    userType: string | null;
    reason: AiIdentityProvisionerFindingReason;
    fixSql: string;
};

export type AiIdentityProvisioningSettings = {
    aiIdentityAccountUuid: string;
    mode: AiIdentityCreationMode;
    effectiveMode: AiIdentityCreationMode;
    fallbackReason: string | null;
    provisioner: AiIdentityProvisioner | null;
    setupSql: string | null;
    cleanupSql: string | null;
    aiRoles: AiIdentityAiRoleDefinition[];
    catalogProjectUuid: string;
    defaultWarehouse: string;
    mappings: AiIdentityRoleMapping[];
    findings: AiIdentityProvisionerFinding[];
    aiRoleExpansions: AiIdentityAiRoleExpansion[];
    ungrantedSchemas: AiIdentityUngrantedSchemas[];
    worstCaseNotice: string;
    showUsersNotice: string;
};

export type AiIdentityAiRoleExpansion = {
    roleName: string;
    allowed: string[];
    excluded: string[];
    excludedByPattern: { pattern: string; count: number }[];
    catalogLoaded: boolean;
};

export type UpdateAiIdentityProvisioningSettings = {
    mode: AiIdentityCreationMode;
};

export type RunAiIdentityProvisioningRequest = {
    approveStatements: true;
};

export type ApiAiIdentityProvisioningSettingsResponse = {
    status: 'ok';
    results: AiIdentityProvisioningSettings;
};

export type ApiAiIdentityProvisioningPlanResponse = {
    status: 'ok';
    results: AiIdentityProvisioningPlan;
};
