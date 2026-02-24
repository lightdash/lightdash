import type { SessionUser } from '@lightdash/common';

/**
 * Options for soft-delete operations.
 * Use `bypassPermissions: true` in cascade calls where the parent
 * operation already verified the user has permission.
 */
export type SoftDeleteOptions = {
    bypassPermissions?: boolean;
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
}
