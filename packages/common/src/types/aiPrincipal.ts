import assertUnreachable from '../utils/assertUnreachable';
import { type AgentIdentityClaim, type AiActorKind } from './agentIdentity';
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

export type AiAssurance =
    | { kind: 'agent_session_active' }
    | { kind: 'agent_marker'; level: AiAgentMarkerLevel }
    | { kind: 'result_cache_off' };

export type AiWarehouseCapabilities = {
    marker: AiAgentMarker;
    warehouseType: WarehouseTypes;
};

type AiExecutionAudit = {
    actorKind: AiActorKind;
    personUuid: string;
    principalRef: string;
    queryTags: Record<string, string>;
};

export type AiExecutionPlan = {
    agentIdentity?: AgentIdentityClaim | null;
    sourceIdentities?: {
        queryUuid: string;
        agentIdentity: AgentIdentityClaim | null;
    }[];
} & (
    | {
          identity: 'ai_service_account';
          sourceProjectUuid: string;
          inheritedFromProjectUuid: string | null;
          identityUuid: string;
          credentialUuid: string;
          credentials: CreateWarehouseCredentials;
          assurances: AiAssurance[];
          audit: AiExecutionAudit & { userUuid: string | null };
      }
    | {
          identity: 'connected_person';
          identityUuid: string;
          credentials: CreateWarehouseCredentials;
          assurances: AiAssurance[];
          audit: AiExecutionAudit;
      }
    | {
          identity: 'marked_person';
          assurances: [{ kind: 'agent_marker'; level: AiAgentMarkerLevel }];
          audit: AiExecutionAudit & { userUuid: string | null };
      }
);

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

export enum AgentIdentityConnectEntryPoint {
    CHAT_CARD = 'chat_card',
    MY_WAREHOUSE_CONNECTIONS = 'my_warehouse_connections',
    MY_AGENT_CONNECTIONS = 'my_agent_connections',
    MCP_CONNECT_LINK = 'mcp_connect_link',
    CLI = 'cli',
    MCP_CONSENT = 'mcp_consent',
    OAUTH_CONSENT = 'oauth_consent',
    SLACK_LINK = 'slack_link',
    UNKNOWN = 'unknown',
}

export enum AgentIdentityConnectFailureReason {
    ACCESS_DENIED = 'access_denied',
    OAUTH_ERROR = 'oauth_error',
    STATE_MISMATCH = 'state_mismatch',
    TOKEN_EXCHANGE_FAILED = 'token_exchange_failed',
    NO_REFRESH_TOKEN = 'no_refresh_token',
    NOT_AGENT_SESSION = 'not_agent_session',
    SESSION_CHECK_FAILED = 'session_check_failed',
    LICENSE_REQUIRED = 'license_required',
    ORGANIZATION_REQUIRED = 'organization_required',
    NOT_CONFIGURED = 'not_configured',
    CREDENTIAL_SAVE_FAILED = 'credential_save_failed',
    SIGN_IN_FAILED = 'sign_in_failed',
}

export enum AiAccessRefusalReason {
    RESULT_NOT_AGENT_PRODUCED = 'result_not_agent_produced',
    PRINCIPAL_FAILED = 'principal_failed',
    AI_SERVICE_ACCOUNT_MISSING = 'ai_service_account_missing',
    AI_SERVICE_ACCOUNT_INVALID = 'ai_service_account_invalid',
    NEEDS_SIGN_IN = 'needs_sign_in',
    SIGN_IN_EXPIRED = 'sign_in_expired',
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
    connectUrl: string | null;
};

export const getAiAccessRefusalMessage = (
    reason: AiAccessRefusalReason,
    { projectName }: { projectName: string | null },
): string => {
    switch (reason) {
        case AiAccessRefusalReason.AI_SERVICE_ACCOUNT_MISSING:
            return `Agents can't query ${projectName ?? 'this project'} yet. It needs an AI service account, and none is set up. A project admin can add one in Agent identity.`;
        case AiAccessRefusalReason.AI_SERVICE_ACCOUNT_INVALID:
            return `Agents can't query ${projectName ?? 'this project'} right now. Its AI service account failed to sign in. A project admin can check it in Agent identity.`;
        case AiAccessRefusalReason.RESULT_NOT_AGENT_PRODUCED:
            return 'AI cannot use these results because your current agent connection did not produce them. Run the query again through your agent.';
        case AiAccessRefusalReason.PRINCIPAL_FAILED:
            return 'The last check of your AI principal failed. Ask an admin to review it.';
        case AiAccessRefusalReason.SIGN_IN_EXPIRED:
            return 'Your agent connection expired. Connect again.';
        case AiAccessRefusalReason.NEEDS_SIGN_IN:
            return 'Connect your agent to the warehouse once so it can run as you.';
        case AiAccessRefusalReason.WAREHOUSE_NOT_SUPPORTED:
            return 'AI principals are not available for this warehouse yet.';
        case AiAccessRefusalReason.EMBED_NOT_SUPPORTED:
            return 'AI access runs as a signed-in person. Embedded viewers cannot use it on this connection.';
        case AiAccessRefusalReason.SERVICE_ACCOUNT:
            return 'AI access runs as a person. Service accounts cannot use it on this connection.';
        default:
            return assertUnreachable(
                reason,
                'Unknown AI access refusal reason',
            );
    }
};

export const getAiAccessRefusalAction = (
    reason: AiAccessRefusalReason,
): AiAccessRefusalAction | null => {
    switch (reason) {
        case AiAccessRefusalReason.SIGN_IN_EXPIRED:
        case AiAccessRefusalReason.NEEDS_SIGN_IN:
            return AiAccessRefusalAction.SIGN_IN;
        case AiAccessRefusalReason.PRINCIPAL_FAILED:
        case AiAccessRefusalReason.AI_SERVICE_ACCOUNT_MISSING:
        case AiAccessRefusalReason.AI_SERVICE_ACCOUNT_INVALID:
            return AiAccessRefusalAction.ASK_ADMIN;
        case AiAccessRefusalReason.RESULT_NOT_AGENT_PRODUCED:
        case AiAccessRefusalReason.EMBED_NOT_SUPPORTED:
        case AiAccessRefusalReason.WAREHOUSE_NOT_SUPPORTED:
        case AiAccessRefusalReason.SERVICE_ACCOUNT:
            return null;
        default:
            return assertUnreachable(
                reason,
                'Unknown AI access refusal reason',
            );
    }
};

export const isAiAccessRefusal = (value: unknown): value is AiAccessRefusal =>
    typeof value === 'object' &&
    value !== null &&
    (value as { code?: AnyType }).code === AI_ACCESS_REFUSED_CODE &&
    typeof (value as { message?: AnyType }).message === 'string';

export type OrganizationAgentIdentitySettings = {
    requireVerifiedAgentSessions: boolean;
};

export type ApiOrganizationAgentIdentitySettingsResponse = {
    status: 'ok';
    results: OrganizationAgentIdentitySettings;
};

export type AiAccessForUser = {
    requirementSource: 'organization' | null;
    identity: AiExecutionPlan['identity'] | null;
    source: 'marked_person' | 'agent_sign_in' | 'ai_service_account' | null;
    marker: AiAgentMarker | null;
    projectUuid: string;
    warehouseConnectionUuid: string | null;
    enabled: boolean;
    principalKind: 'person' | 'service_account' | null;
    refusal: AiAccessRefusal | null;
    expiresAt: Date | null;
    principalName: string | null;
};

export type ApiAiWarehouseCapabilitiesResponse = {
    status: 'ok';
    results: AiWarehouseCapabilities;
};

export type ApiAiAccessForUserResponse = {
    status: 'ok';
    results: AiAccessForUser;
};

export const getAiExecutionCredentialUuid = (
    plan: AiExecutionPlan | null,
): string | null => {
    if (plan === null) return null;
    switch (plan.identity) {
        case 'connected_person':
        case 'ai_service_account':
            return plan.identityUuid;
        case 'marked_person':
            return null;
        default:
            return assertUnreachable(plan, 'Unknown AI execution identity');
    }
};
