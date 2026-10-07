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
    personUuid: string;
    principalRef: string;
    queryTags: Record<string, string>;
};

export type AiExecutionPlan =
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
    RESULT_NOT_AGENT_PRODUCED = 'result_not_agent_produced',
    PRINCIPAL_FAILED = 'principal_failed',
    NEEDS_SIGN_IN = 'needs_sign_in',
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
): string => {
    switch (reason) {
        case AiAccessRefusalReason.RESULT_NOT_AGENT_PRODUCED:
            return 'AI cannot use these results because your current agent connection did not produce them. Run the query again through your agent.';
        case AiAccessRefusalReason.PRINCIPAL_FAILED:
            return 'The last check of your AI principal failed. Ask an admin to review it.';
        case AiAccessRefusalReason.NEEDS_SIGN_IN:
            return 'Connect your agent to the warehouse once so it can run as you.';
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
        case AiAccessRefusalReason.PRINCIPAL_FAILED:
            return AiAccessRefusalAction.ASK_ADMIN;
        case AiAccessRefusalReason.RESULT_NOT_AGENT_PRODUCED:
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

export type OrganizationAgentIdentitySettings = {
    requireVerifiedAgentSessions: boolean;
};

export type ApiOrganizationAgentIdentitySettingsResponse = {
    status: 'ok';
    results: OrganizationAgentIdentitySettings;
};

export type AiAccessForUser = {
    requirementSource: 'organization' | null;
    identity: 'marked_person' | 'connected_person' | null;
    marker: AiAgentMarker | null;
    projectUuid: string;
    warehouseConnectionUuid: string | null;
    enabled: boolean;
    principalKind: 'person' | null;
    refusal: AiAccessRefusal | null;
};

export type ApiAiWarehouseCapabilitiesResponse = {
    status: 'ok';
    results: AiWarehouseCapabilities;
};

export type ApiAiAccessForUserResponse = {
    status: 'ok';
    results: AiAccessForUser;
};
