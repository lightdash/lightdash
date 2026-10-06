import {
    AI_IDENTITY_SYNC_MAX_AGE_MINUTES,
    AiIdentitySyncStatus,
    type AiIdentitySyncUnsafeReason,
} from '../types/aiIdentityAutomaticSync';

type Run = {
    status: AiIdentitySyncStatus;
    lastRunAt: Date;
    lastOkStartedAt?: Date | null;
    schemaWatermark?: Date | null;
};

export const aiIdentityAutomaticSyncUnsafeReason = (
    run: Run,
    now: Date,
): AiIdentitySyncUnsafeReason | null => {
    if (run.status !== AiIdentitySyncStatus.OK || !run.lastOkStartedAt)
        return 'no_ok_run';
    const age = now.getTime() - run.lastRunAt.getTime();
    if (
        !Number.isFinite(age) ||
        age < 0 ||
        age > AI_IDENTITY_SYNC_MAX_AGE_MINUTES * 60_000
    )
        return 'stale_run';
    if (!run.schemaWatermark || Number.isNaN(run.schemaWatermark.getTime()))
        return 'schema_changed';
    if (run.schemaWatermark > run.lastOkStartedAt) return 'schema_changed';
    return null;
};

export const isAiIdentityAutomaticSyncSafe = (run: Run, now: Date): boolean =>
    aiIdentityAutomaticSyncUnsafeReason(run, now) === null;

export const aiIdentityAutomaticSyncGate = (
    run: Run,
    now: Date,
):
    | { status: 'OK'; reason: null }
    | { status: 'PROGRESS'; reason: 'no_ok_run' }
    | { status: 'UNSAFE'; reason: AiIdentitySyncUnsafeReason } => {
    if (run.status === AiIdentitySyncStatus.RUNNING && !run.lastOkStartedAt) {
        const age = now.getTime() - run.lastRunAt.getTime();
        if (age >= 0 && age < AI_IDENTITY_SYNC_MAX_AGE_MINUTES * 60_000)
            return { status: 'PROGRESS', reason: 'no_ok_run' };
    }
    const reason = aiIdentityAutomaticSyncUnsafeReason(run, now);
    return reason === null
        ? { status: 'OK', reason: null }
        : { status: 'UNSAFE', reason };
};
