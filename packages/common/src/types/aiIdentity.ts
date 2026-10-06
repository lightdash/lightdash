import type { AiIdentityCreationMode } from './aiIdentityProvisioning';

export enum AiIdentityStatus {
    PENDING = 'pending',
    READY = 'ready',
    FAILED = 'failed',
}

export enum AiIdentityState {
    READY = 'ready',
    PENDING = 'pending',
    FAILED = 'failed',
    NEEDS_SIGN_IN = 'needs_sign_in',
}

export enum AiIdentityFailureReason {
    KEY_OR_USER_REJECTED = 'key_or_user_rejected',
    NOT_SERVICE_AGENT = 'not_service_agent',
    WRONG_USER = 'wrong_user',
    WAREHOUSE_ACCESS = 'warehouse_access',
    DISABLED_OR_LOCKED = 'disabled_or_locked',
    NETWORK_POLICY = 'network_policy',
    UNKNOWN = 'unknown',
}

export enum AiIdentityFailureSeverity {
    SECURITY = 'security',
    AVAILABILITY = 'availability',
}

export const SNOWFLAKE_LOGIN_PLACEHOLDER = '{snowflake_login}';
export const AI_IDENTITY_NAME_PLACEHOLDER = '{ai_identity_name}';
export const DEFAULT_AI_IDENTITY_ROLE_TEMPLATE = `${AI_IDENTITY_NAME_PLACEHOLDER}_ROLE`;

export const DEFAULT_AI_TWIN_NAME_TEMPLATE = `${SNOWFLAKE_LOGIN_PLACEHOLDER}_AI`;

export const AI_IDENTITY_STALE_PENDING_DAYS = 7;

export const AI_IDENTITY_NOT_READY_CODE = 'ai_identity_not_ready';

export type AiIdentityAccount = {
    aiIdentityAccountUuid: string;
    snowflakeAccount: string;
    twinNameTemplate: string | null;
    roleTemplate: string | null;
    lastFullCheckAt: Date | null;
    effectiveMode: AiIdentityCreationMode;
    fallbackReason: string | null;
    counts: AiIdentityStateCounts;
};

export type AiIdentityStateCounts = Record<AiIdentityState, number> & {
    total: number;
};

export type AiIdentity = {
    aiIdentityUuid: string;
    aiIdentityAccountUuid: string;
    snowflakeAccount: string;
    userUuid: string;
    email: string;
    firstName: string;
    lastName: string;
    snowflakeLogin: string | null;
    twinNameOverride: string | null;
    twinName: string | null;
    publicKey: string | null;
    publicKeyFingerprint: string | null;
    state: AiIdentityState;
    stale: boolean;
    failureReason: AiIdentityFailureReason | null;
    statusMessage: string | null;
    checkedAt: Date | null;
    createdAt: Date;
};

export type AiIdentityFailureGroup = {
    reason: AiIdentityFailureReason;
    severity: AiIdentityFailureSeverity;
    count: number;
    title: string;
    explanation: string;
    fix: string;
};

export enum AiIdentitySort {
    SEVERITY = 'severity',
    LAST_CHECKED = 'last_checked',
    NAME = 'name',
}

export type AiIdentityFilter = {
    aiIdentityAccountUuid: string;
    aiIdentityUuids?: string[] | null;
    states: AiIdentityState[];
    reasons: AiIdentityFailureReason[];
    projectUuid: string | null;
    search: string | null;
    staleOnly: boolean;
};

export type AiIdentityListResult = {
    data: AiIdentity[];
    pagination: {
        page: number;
        pageSize: number;
        totalResults: number;
        totalPageCount: number;
    };
    counts: AiIdentityStateCounts;
    failureGroups: AiIdentityFailureGroup[];
};

export type AiIdentityEventActorType = 'user' | 'api' | 'scheduler';

export type AiIdentityEvent = {
    aiIdentityEventUuid: string;
    aiIdentityAccountUuid: string | null;
    aiIdentityUuid: string | null;
    actorType: AiIdentityEventActorType;
    actorUserUuid: string | null;
    actorName: string | null;
    action: string;
    targetCount: number;
    status: 'success' | 'error';
    detail: string | null;
    createdAt: Date;
};

export type AiIdentityDetail = {
    identity: AiIdentity;
    fixSql: string | null;
    sameReasonCount: number;
    history: AiIdentityEvent[];
};

export enum AiIdentityJobKind {
    TEST = 'test',
    EXPORT = 'export',
    SYNC = 'sync',
    PROVISION = 'provision',
    GRANT_SYNC = 'grant_sync',
}

export enum AiIdentityJobStatus {
    QUEUED = 'queued',
    RUNNING = 'running',
    DONE = 'done',
    FAILED = 'failed',
}

export type AiIdentityExportFormat = 'json' | 'sql' | 'csv';

export type AiIdentityJob = {
    jobUuid: string;
    kind: AiIdentityJobKind;
    status: AiIdentityJobStatus;
    total: number;
    done: number;
    fileUrl: string | null;
    skipped: { email: string; reason: string }[];
    error: string | null;
    createdAt: Date;
};

export type AiIdentityBulkTestRequest = {
    filter: AiIdentityFilter;
};

export type AiIdentityExportRequest = {
    filter: AiIdentityFilter;
    format: AiIdentityExportFormat;
    roleForTwin?: string | null;
};

export type UpdateAiIdentityAccount = {
    twinNameTemplate: string | null;
    roleTemplate: string | null;
};

export type UpdateAiIdentity = {
    twinNameOverride: string | null;
};

export type AiIdentityPersonAction = 'sign_in' | 'ask_admin' | null;

export type AiAccessForUser = {
    projectUuid: string;
    restrictionsOn: boolean;
    warehouseType: string | null;
    aiIdentityRequired: boolean;
    automaticSyncRefusal: boolean;
    state: AiIdentityState | null;
    aiIdentityName: string | null;
    lastCheckedAt: Date | null;
    action: AiIdentityPersonAction;
    message: string | null;
    rawSqlAllowed: boolean;
};

export type ApiAiIdentityAccountsResponse = {
    status: 'ok';
    results: AiIdentityAccount[];
};

export type ApiAiIdentityPreviewResponse = {
    status: 'ok';
    results: AiIdentity[];
};

export type ApiAiIdentityAccountResponse = {
    status: 'ok';
    results: AiIdentityAccount;
};

export type ApiAiIdentityListResponse = {
    status: 'ok';
    results: AiIdentityListResult;
};

export type ApiAiIdentityResponse = {
    status: 'ok';
    results: AiIdentity;
};

export type ApiAiIdentityDetailResponse = {
    status: 'ok';
    results: AiIdentityDetail;
};

export type ApiAiIdentityJobResponse = {
    status: 'ok';
    results: AiIdentityJob;
};

export type ApiAiIdentityEventsResponse = {
    status: 'ok';
    results: {
        data: AiIdentityEvent[];
        pagination: {
            page: number;
            pageSize: number;
            totalResults: number;
            totalPageCount: number;
        };
    };
};

export type ApiAiAccessForUserResponse = {
    status: 'ok';
    results: AiAccessForUser;
};

export const AI_IDENTITY_NEEDS_SIGN_IN_MESSAGE =
    'Sign in to Snowflake once so Lightdash can set up your AI identity.';

export const AI_IDENTITY_ASK_ADMIN_MESSAGE =
    "Your AI identity isn't set up yet. Ask an admin to set it up.";

export const getAiIdentityPersonLabel = (state: AiIdentityState): string => {
    if (state === AiIdentityState.READY) return 'Ready';
    if (state === AiIdentityState.NEEDS_SIGN_IN)
        return 'Needs Snowflake sign-in';
    return 'Not ready';
};

export const getAiIdentityPersonMessage = (state: AiIdentityState): string =>
    state === AiIdentityState.NEEDS_SIGN_IN
        ? AI_IDENTITY_NEEDS_SIGN_IN_MESSAGE
        : AI_IDENTITY_ASK_ADMIN_MESSAGE;

export const fillAiTwinName = (
    template: string,
    snowflakeLogin: string,
): string => template.split(SNOWFLAKE_LOGIN_PLACEHOLDER).join(snowflakeLogin);

export const resolveAiTwinName = ({
    twinNameOverride,
    twinNameTemplate,
    snowflakeLogin,
}: {
    twinNameOverride: string | null;
    twinNameTemplate: string | null;
    snowflakeLogin: string | null;
}): string | null => {
    if (twinNameOverride !== null) return twinNameOverride;
    if (twinNameTemplate === null || snowflakeLogin === null) return null;
    return fillAiTwinName(twinNameTemplate, snowflakeLogin);
};

export const normalizeSnowflakeAccount = (account: string): string =>
    account
        .trim()
        .replace(/^https?:\/\//i, '')
        .replace(/\.snowflakecomputing\.com\/?$/i, '')
        .toUpperCase();
