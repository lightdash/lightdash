export enum AiIdentitySyncStatus {
    OK = 'OK',
    WARN = 'WARN',
    RUNNING = 'RUNNING',
    UNSAFE = 'UNSAFE',
}

export type AiIdentitySyncIssueCode =
    | 'blocked_by_scope'
    | 'bad_pattern'
    | 'rule_conflict'
    | 'future_grant_conflict'
    | 'view_dependency'
    | 'role_inheritance'
    | 'public_grant'
    | 'statement_failed'
    | 'sync_failed';

export type AiIdentitySyncIssue = {
    code: AiIdentitySyncIssueCode;
    message: string;
    roleName: string | null;
    database: string | null;
    schema: string | null;
};

export type AiIdentityManagedScope = {
    roleName: string;
    database: string;
};

export type AiIdentitySyncUnsafeReason =
    | 'exposure'
    | 'exposure_check_failed'
    | 'no_ok_run'
    | 'stale_run';

export type AiIdentityExposureCheck = {
    status: 'OK' | 'UNSAFE';
    exposed: string[];
    error: string | null;
};

export const AI_IDENTITY_EXPOSURE_MESSAGE =
    'AI is paused. An AI role can read a schema that its exclusions do not allow. AI starts again after the next grant sync.';
export const AI_IDENTITY_EXPOSURE_CHECK_FAILED_MESSAGE =
    'AI is paused. The AI role grants in Snowflake could not be checked.';

export type AiIdentityAutomaticSync = {
    pending: boolean;
    status: AiIdentitySyncStatus | null;
    lastRunAt: Date | null;
    managedScope: AiIdentityManagedScope[];
    issues: AiIdentitySyncIssue[];
    progress: number;
    unsafeReason?: AiIdentitySyncUnsafeReason | null;
};

export const AI_IDENTITY_SYNC_MAX_AGE_MINUTES = 60;
export const AI_IDENTITY_SYNC_UNSAFE_CODE = 'ai_identity_sync_unsafe';
export const AI_IDENTITY_SYNC_UNSAFE_MESSAGE =
    'AI grant sync is not safe or recent. Ask an admin to check it.';
