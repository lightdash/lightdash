import { type AnyType } from './any';
import {
    type CreateWarehouseCredentials,
    type WarehouseTypes,
} from './projects';

export const AI_AGENT_TAG = 'agent';
export const AI_AGENT_APPLICATION_NAME = 'lightdash-ai';
export const AI_AGENT_SESSION_SETTING = 'lightdash.agent';

export enum AiAgentMarkerLevel {
    VERIFIED_SESSION = 'verified_session',
    REQUEST_BOUND = 'request_bound',
    IDENTIFY_ONLY = 'identify_only',
    NONE = 'none',
}

export type AiAgentMarker = {
    level: AiAgentMarkerLevel;
    signals: { name: string; where: string }[];
    note: string | null;
    enforce: string | null;
};

export enum AiPrincipalKind {
    PERSON = 'person',
    TWIN = 'twin',
    GROUP = 'group',
    SHARED = 'shared',
}

export type AiPrincipalSelector =
    | { kind: AiPrincipalKind.PERSON }
    | { kind: AiPrincipalKind.TWIN; ref: string }
    | { kind: AiPrincipalKind.GROUP; ref: string }
    | { kind: AiPrincipalKind.SHARED; ref: string };

export enum AiTransportKind {
    DIRECT = 'direct',
    PROCEDURE = 'procedure',
}

export enum AiProcedureRights {
    RESTRICTED_CALLER = 'restrictedCaller',
    DEFINER = 'definer',
}

export type AiTransport =
    | { kind: AiTransportKind.DIRECT }
    | {
          kind: AiTransportKind.PROCEDURE;
          name: string;
          rights: AiProcedureRights;
      };

export const AI_DIRECT_TRANSPORT: AiTransport = {
    kind: AiTransportKind.DIRECT,
};

export enum AiPrincipalStatus {
    PENDING = 'pending',
    READY = 'ready',
    FAILED = 'failed',
}

export enum AiPrincipalFailureReason {
    CREDENTIAL_REJECTED = 'credential_rejected',
    WRONG_PRINCIPAL = 'wrong_principal',
    NOT_AGENT_SESSION = 'not_agent_session',
    NO_RESTRICTED_SESSION_SCOPE = 'no_restricted_session_scope',
    NOT_GROUP_MEMBER = 'not_group_member',
    RESULT_CACHE_ON = 'result_cache_on',
    PROCEDURE_MISSING = 'procedure_missing',
    WAREHOUSE_ACCESS = 'warehouse_access',
    DISABLED_OR_LOCKED = 'disabled_or_locked',
    NETWORK_POLICY = 'network_policy',
    BROKER_FAILED = 'broker_failed',
    UNKNOWN = 'unknown',
}

export type AiAssurance =
    | { kind: 'current_user_is'; expected: string }
    | { kind: 'agent_session_active' }
    | { kind: 'agent_marker'; level: AiAgentMarkerLevel }
    | { kind: 'restricted_session_scope_active' }
    | { kind: 'group_member'; group: string }
    | { kind: 'result_cache_off' }
    | {
          kind: 'procedure_present';
          name: string;
          rights: AiProcedureRights;
      };

export type AiProbeObserved = Record<string, string | null>;

export type AiProbeResult =
    | { ok: true; checkedAt: Date; observed: AiProbeObserved }
    | {
          ok: false;
          transient: boolean;
          checkedAt: Date;
          reason: AiPrincipalFailureReason;
          message: string;
          observed: AiProbeObserved;
      };

export enum AiCredentialMethod {
    BROKER = 'broker',
    KEY = 'key',
    SIGN_IN = 'sign_in',
    MARKER = 'marker',
}

export type AiPrincipalKindCapability =
    | { available: true; method: AiCredentialMethod }
    | { available: false; reason: string };

export type AiTransportCapability =
    | { available: true }
    | { available: false; reason: string };

export enum AiSetupScriptFormat {
    SQL = 'sql',
    TERRAFORM = 'terraform',
    RULES = 'rules',
    IAM = 'iam',
}

export type AiWarehouseCapabilities = {
    marker: AiAgentMarker;
    warehouseType: WarehouseTypes;
    principals: Record<AiPrincipalKind, AiPrincipalKindCapability>;
    transports: Record<AiTransportKind, AiTransportCapability>;
    setupFormat: AiSetupScriptFormat;
};

export type AiGroupMapping = {
    groupUuid: string;
    groupName: string;
    ref: string;
    priority: number;
};

export type AiPolicySource = {
    label: string;
    url: string | null;
};

export type AiAccessPolicy = {
    aiAccessPolicyUuid: string;
    projectUuid: string;
    warehouseConnectionUuid: string | null;
    enabled: boolean;
    principalKind: AiPrincipalKind;
    transport: AiTransport;
    sharedRef: string | null;
    twinNameTemplate: string | null;
    groupMappings: AiGroupMapping[];
    policySource: AiPolicySource | null;
    createdAt: Date;
    updatedAt: Date;
};

export type UpsertAiAccessPolicy = Pick<
    AiAccessPolicy,
    | 'enabled'
    | 'principalKind'
    | 'transport'
    | 'sharedRef'
    | 'twinNameTemplate'
    | 'policySource'
> & {
    groupMappings: Pick<AiGroupMapping, 'groupUuid' | 'ref' | 'priority'>[];
};

export type AiPrincipal = {
    aiPrincipalUuid: string;
    aiAccessPolicyUuid: string;
    kind: AiPrincipalKind;
    ref: string;
    userUuid: string | null;
    groupUuid: string | null;
    status: AiPrincipalStatus;
    failureReason: AiPrincipalFailureReason | null;
    statusMessage: string | null;
    lastProbe: AiProbeResult | null;
    publicKey: string | null;
    publicKeyFingerprint: string | null;
    createdAt: Date;
    updatedAt: Date;
};

export type AiPrincipalWithSecrets = AiPrincipal & {
    secret: string | null;
};

export type AiSetupScriptPart = {
    title: string;
    body: string;
};

export type AiSetupScript = {
    format: AiSetupScriptFormat;
    parts: AiSetupScriptPart[];
};

type AiExecutionAudit = {
    personUuid: string;
    principalRef: string;
    queryTags: Record<string, string>;
};

export type AiExecutionPlan =
    | {
          identity: 'principal';
          principal: AiPrincipal;
          transport: AiTransport;
          credentials: CreateWarehouseCredentials;
          assurances: AiAssurance[];
          audit: AiExecutionAudit;
      }
    | {
          identity: 'marked_person';
          transport: { kind: AiTransportKind.DIRECT };
          assurances: [{ kind: 'agent_marker'; level: AiAgentMarkerLevel }];
          audit: AiExecutionAudit & { userUuid: string | null };
      };

export type AiMarkerTestResult = {
    ok: boolean;
    level: AiAgentMarkerLevel;
    observed: Record<string, string | null>;
    message: string;
    checkedAt: Date;
};

export type ApiAiMarkerTestResponse = {
    status: 'ok';
    results: AiMarkerTestResult;
};

export const AI_PRINCIPAL_QUERY_TAG = 'ai_principal';

export enum AiAccessRefusalReason {
    NO_POLICY = 'no_policy',
    PRINCIPAL_PENDING = 'principal_pending',
    PRINCIPAL_FAILED = 'principal_failed',
    NEEDS_SIGN_IN = 'needs_sign_in',
    NO_GROUP_MAPPING = 'no_group_mapping',
    TRANSPORT_UNAVAILABLE = 'transport_unavailable',
    WAREHOUSE_NOT_SUPPORTED = 'warehouse_not_supported',
    SERVICE_ACCOUNT = 'service_account',
    EMBED_NOT_SUPPORTED = 'embed_not_supported',
}

export enum AiAccessRefusalAction {
    SIGN_IN = 'sign_in',
    ASK_ADMIN = 'ask_admin',
}

export const AI_ACCESS_REFUSED_CODE = 'ai_access_refused';

export type AiAccessRefusal = {
    code: 'ai_access_refused';
    reason: AiAccessRefusalReason;
    message: string;
    action: AiAccessRefusalAction | null;
    settingsUrl: string | null;
};

export const getAiAccessRefusalMessage = (
    reason: AiAccessRefusalReason,
): string => {
    switch (reason) {
        case AiAccessRefusalReason.NO_POLICY:
            return 'AI access is on for this connection, but no AI principal is set up. Ask an admin to set one up.';
        case AiAccessRefusalReason.PRINCIPAL_PENDING:
            return 'Your AI principal is not ready yet. Ask an admin to finish the setup in the warehouse.';
        case AiAccessRefusalReason.PRINCIPAL_FAILED:
            return 'The last check of your AI principal failed. Ask an admin to review it.';
        case AiAccessRefusalReason.NEEDS_SIGN_IN:
            return 'Connect your agent to the warehouse once so it can run as you.';
        case AiAccessRefusalReason.NO_GROUP_MAPPING:
            return 'None of your groups has an AI principal. Ask an admin to map your group.';
        case AiAccessRefusalReason.TRANSPORT_UNAVAILABLE:
            return 'The procedure that AI queries go through is not available. Ask an admin to check it.';
        case AiAccessRefusalReason.WAREHOUSE_NOT_SUPPORTED:
            return 'AI principals are not available for this warehouse yet.';
        case AiAccessRefusalReason.EMBED_NOT_SUPPORTED:
            return 'AI access runs as a signed-in person. Embedded viewers cannot use it on this connection.';
        case AiAccessRefusalReason.SERVICE_ACCOUNT:
            return 'AI access runs as a person. Service accounts cannot use it on this connection.';
        default: {
            const exhaustive: never = reason;
            return String(exhaustive);
        }
    }
};

export const getAiAccessRefusalAction = (
    reason: AiAccessRefusalReason,
): AiAccessRefusalAction | null => {
    switch (reason) {
        case AiAccessRefusalReason.NEEDS_SIGN_IN:
            return AiAccessRefusalAction.SIGN_IN;
        case AiAccessRefusalReason.NO_POLICY:
        case AiAccessRefusalReason.PRINCIPAL_PENDING:
        case AiAccessRefusalReason.PRINCIPAL_FAILED:
        case AiAccessRefusalReason.NO_GROUP_MAPPING:
        case AiAccessRefusalReason.TRANSPORT_UNAVAILABLE:
            return AiAccessRefusalAction.ASK_ADMIN;
        case AiAccessRefusalReason.EMBED_NOT_SUPPORTED:
        case AiAccessRefusalReason.WAREHOUSE_NOT_SUPPORTED:
        case AiAccessRefusalReason.SERVICE_ACCOUNT:
            return null;
        default: {
            const exhaustive: never = reason;
            return exhaustive;
        }
    }
};

export const isAiAccessRefusal = (value: unknown): value is AiAccessRefusal =>
    typeof value === 'object' &&
    value !== null &&
    (value as { code?: AnyType }).code === AI_ACCESS_REFUSED_CODE &&
    typeof (value as { message?: AnyType }).message === 'string';

export type AiAccessForUser = {
    identity: 'marked_person' | 'principal' | null;
    marker: AiAgentMarker | null;
    projectUuid: string;
    warehouseConnectionUuid: string | null;
    enabled: boolean;
    principalKind: AiPrincipalKind | null;
    principal: Pick<AiPrincipal, 'aiPrincipalUuid' | 'ref' | 'status'> | null;
    refusal: AiAccessRefusal | null;
};

export type ApiAiAccessPolicyResponse = {
    status: 'ok';
    results: AiAccessPolicy | null;
};

export type ApiAiWarehouseCapabilitiesResponse = {
    status: 'ok';
    results: AiWarehouseCapabilities;
};

export type ApiAiPrincipalsResponse = {
    status: 'ok';
    results: AiPrincipal[];
};

export type ApiAiPrincipalResponse = {
    status: 'ok';
    results: AiPrincipal;
};

export type ApiAiSetupScriptResponse = {
    status: 'ok';
    results: AiSetupScript;
};

export type ApiAiAccessForUserResponse = {
    status: 'ok';
    results: AiAccessForUser;
};
