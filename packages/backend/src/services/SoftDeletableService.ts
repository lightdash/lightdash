import type { SessionUser } from '@lightdash/common';
import type { SoftDeletableModel } from '../models/SoftDeletableModel';

/**
 * Options for soft-delete operations.
 * Use `bypassPermissions: true` in cascade calls where the parent
 * operation already verified the user has permission.
 */
export type SoftDeleteOptions = {
    bypassPermissions?: boolean;
};

export type CleanupConfig = {
    batchSize: number;
    delayMs: number;
    maxBatches: number;
};

export type CleanupResult = {
    totalDeleted: number;
    batchCount: number;
};

/**
 * Standard interface for services that support soft-delete lifecycle:
 *
 * - `delete()`          — entry point; checks perms + feature flag, delegates to softDelete or hard-delete
 * - `softDelete()`      — marks record as deleted, cascades to children
 * - `restore()`         — restores from trash, cascades to children
 * - `permanentDelete()` — permanently removes a trashed record
 *
 * SchedulerService does NOT implement this interface because it operates
 * by parent UUID (chart/dashboard), not by its own entity UUID.
 */
export interface SoftDeletableService {
    delete(
        user: SessionUser,
        uuid: string,
        options?: SoftDeleteOptions,
    ): Promise<void>;

    softDelete(
        user: SessionUser,
        uuid: string,
        options?: SoftDeleteOptions,
    ): Promise<void>;

    restore(
        user: SessionUser,
        uuid: string,
        options?: SoftDeleteOptions,
    ): Promise<void>;

    permanentDelete(
        user: SessionUser,
        uuid: string,
        options?: SoftDeleteOptions,
    ): Promise<void>;

    permanentDeleteExpired(
        retentionDays: number,
        config: CleanupConfig,
    ): Promise<CleanupResult>;
}

export async function batchDeleteExpired(
    model: Pick<SoftDeletableModel, 'permanentlyDeleteExpiredBatch'>,
    retentionDays: number,
    config: CleanupConfig,
): Promise<CleanupResult> {
    let totalDeleted = 0;
    let batchCount = 0;
    /* eslint-disable no-await-in-loop */
    for (; batchCount < config.maxBatches; batchCount += 1) {
        const deleted = await model.permanentlyDeleteExpiredBatch(
            retentionDays,
            config.batchSize,
        );
        totalDeleted += deleted;
        if (deleted < config.batchSize) break;
        await new Promise<void>((r) => {
            setTimeout(r, config.delayMs);
        });
    }
    /* eslint-enable no-await-in-loop */
    return { totalDeleted, batchCount };
}
