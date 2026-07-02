import { getErrorMessage } from '@lightdash/common';
import { type SandboxProviderKind } from './index';
import {
    type PersistentWorkspace,
    type SandboxHandle,
    type SandboxLogger,
    type SandboxProvider,
    type SandboxSpec,
    type SnapshotRef,
} from './types';

/** A registry row, narrowed to what the manager reads. */
export interface SandboxRegistryRecord {
    sandboxUuid: string;
    organizationUuid: string;
    projectUuid: string;
    providerSandboxId: string | null;
    snapshotRef: SnapshotRef | null;
    workspace: PersistentWorkspace;
}

/**
 * Persistence the manager needs for the sandbox registry. Implemented by the
 * Knex `SandboxRegistryModel`; a fake satisfies it in tests.
 */
export interface SandboxRegistryStore {
    create(input: {
        organizationUuid: string;
        projectUuid: string;
        provider: string;
        providerSandboxId: string;
        workspace: PersistentWorkspace;
    }): Promise<string>;
    findBySandboxUuid(
        sandboxUuid: string,
    ): Promise<SandboxRegistryRecord | null>;
    markRunning(sandboxUuid: string, providerSandboxId: string): Promise<void>;
    markSuspended(
        sandboxUuid: string,
        input: { snapshotRef: SnapshotRef; providerSandboxId: string | null },
    ): Promise<void>;
    deleteBySandboxUuid(sandboxUuid: string): Promise<void>;
}

/** Thrown when a sandbox can no longer be resumed (row or snapshot is gone). */
export class SandboxExpiredError extends Error {
    constructor(sandboxUuid: string) {
        super(`Sandbox ${sandboxUuid} can no longer be resumed`);
        this.name = 'SandboxExpiredError';
    }
}

export interface SandboxManagerDeps {
    provider: SandboxProvider;
    providerKind: SandboxProviderKind;
    registryModel: SandboxRegistryStore;
    logger: SandboxLogger;
}

/**
 * Layer 1 — the only sandbox lifecycle surface feature code talks to. Wraps a
 * {@link SandboxProvider} with a registry (stable `sandbox_uuid`) and the
 * suspend/resume policy: native-pause backends pause in place; object-store
 * backends snapshot then destroy the container, so steady state holds zero idle
 * sandboxes. Feature code still drives the data plane via {@link SandboxHandle}.
 */
export class SandboxManager {
    private readonly provider: SandboxProvider;

    private readonly providerKind: SandboxProviderKind;

    private readonly registry: SandboxRegistryStore;

    private readonly logger: SandboxLogger;

    constructor(deps: SandboxManagerDeps) {
        this.provider = deps.provider;
        this.providerKind = deps.providerKind;
        this.registry = deps.registryModel;
        this.logger = deps.logger;
    }

    /** Create a fresh sandbox and register it under a new stable id. */
    async acquire(input: {
        spec: SandboxSpec;
        organizationUuid: string;
        projectUuid: string;
        workspace: PersistentWorkspace;
    }): Promise<{ sandboxUuid: string; handle: SandboxHandle }> {
        const handle = await this.provider.create(input.spec);
        try {
            const sandboxUuid = await this.registry.create({
                organizationUuid: input.organizationUuid,
                projectUuid: input.projectUuid,
                provider: this.providerKind,
                providerSandboxId: handle.sandboxId,
                workspace: input.workspace,
            });
            return { sandboxUuid, handle };
        } catch (error) {
            // The provider sandbox exists but has no registry row, so nothing
            // could ever discover it. Destroy the orphan before rethrowing rather
            // than leaking it.
            try {
                await this.provider.destroy(handle.sandboxId);
            } catch (destroyError) {
                this.logger.warn(
                    `Failed to destroy orphaned sandbox ${handle.sandboxId} after registry insert failed: ${getErrorMessage(
                        destroyError,
                    )}`,
                );
            }
            throw error;
        }
    }

    /**
     * Re-materialize a previously-suspended sandbox by its stable id, restoring
     * from the recorded snapshot (or reconnecting to a still-live one). A row
     * owned by a different org/project is treated as not-found.
     */
    async resume(input: {
        sandboxUuid: string;
        spec: SandboxSpec;
        expectedOrganizationUuid: string;
        expectedProjectUuid: string;
    }): Promise<SandboxHandle> {
        const row = await this.registry.findBySandboxUuid(input.sandboxUuid);
        if (
            !row ||
            !SandboxManager.ownedBy(
                row,
                input.expectedOrganizationUuid,
                input.expectedProjectUuid,
            )
        ) {
            throw new SandboxExpiredError(input.sandboxUuid);
        }
        const handle = await this.resumeRow(row, input.spec);
        await this.registry.markRunning(input.sandboxUuid, handle.sandboxId);
        return handle;
    }

    /**
     * Ownership guard: a caller proves which org/project a sandbox belongs to,
     * so a stable id leaked or guessed across tenants can't be resumed,
     * suspended, or destroyed. A mismatch is treated exactly like a missing row.
     */
    private static ownedBy(
        row: SandboxRegistryRecord,
        organizationUuid: string,
        projectUuid: string,
    ): boolean {
        return (
            row.organizationUuid === organizationUuid &&
            row.projectUuid === projectUuid
        );
    }

    private async resumeRow(
        row: SandboxRegistryRecord,
        spec: SandboxSpec,
    ): Promise<SandboxHandle> {
        if (row.snapshotRef) {
            return this.provider.resume(row.snapshotRef, spec);
        }
        if (row.providerSandboxId) {
            return this.provider.connect(row.providerSandboxId);
        }
        throw new SandboxExpiredError(row.sandboxUuid);
    }

    /**
     * End-of-turn suspend. Native-pause backends pause in place; object-store
     * backends snapshot the workspace then destroy the container (the snapshot
     * is the resumable state). The workspace to capture is read from the
     * registry row (recorded at {@link acquire}) — the single source of truth —
     * so a caller holding no handle can still suspend.
     */
    async suspend(input: {
        sandboxUuid: string;
        handle: SandboxHandle;
    }): Promise<void> {
        const row = await this.registry.findBySandboxUuid(input.sandboxUuid);
        if (!row) {
            throw new SandboxExpiredError(input.sandboxUuid);
        }
        // The snapshot a prior turn left on the row is about to be overwritten
        // by the new one below. Object-store backends write a fresh key each
        // suspend, so the old blob would leak unless we GC it once the row
        // points at its replacement.
        const priorRef = row.snapshotRef;
        const ref = await this.provider.persist(input.handle, {
            workspace: row.workspace,
        });
        if (this.provider.capabilities.pauseResume) {
            await this.registry.markSuspended(input.sandboxUuid, {
                snapshotRef: ref,
                providerSandboxId: input.handle.sandboxId,
            });
        } else {
            // Destroy before marking suspended, not after: if destroy throws,
            // the row stays `running` with its live `providerSandboxId`. That is
            // deliberately retryable — resume still works by reconnecting to the
            // live container. The row is only marked `suspended` (promising the
            // snapshot is the resumable state) once the container is actually
            // gone.
            await this.provider.destroy(input.handle.sandboxId);
            await this.registry.markSuspended(input.sandboxUuid, {
                snapshotRef: ref,
                providerSandboxId: null,
            });
        }
        await this.gcConsumedSnapshot(priorRef, ref);
    }

    /**
     * GC the snapshot a resumed turn consumed, now that the row points at its
     * replacement. Best-effort — a leaked blob must never fail an otherwise
     * successful suspend. A no-op for native-pause backends (their snapshot is
     * the suspended sandbox itself, reclaimed by `destroy`) and when the prior
     * ref is unchanged.
     */
    private async gcConsumedSnapshot(
        priorRef: SnapshotRef | null,
        newRef: SnapshotRef,
    ): Promise<void> {
        if (!priorRef || JSON.stringify(priorRef) === JSON.stringify(newRef)) {
            return;
        }
        try {
            await this.provider.deleteSnapshot(priorRef);
        } catch (error) {
            this.logger.warn(
                `Failed to delete prior snapshot after suspend: ${getErrorMessage(
                    error,
                )}`,
            );
        }
    }

    /**
     * Suspend a sandbox by its stable id alone — for callers (cancel,
     * soft-delete) that hold no live handle. Connects to the recorded container
     * then suspends it (snapshot + destroy on object-store backends), preserving
     * state for a later resume. A row with no live sandbox is GC'd (nothing to
     * preserve); an already-gone row is a no-op.
     */
    async suspendByUuid(input: {
        sandboxUuid: string;
        expectedOrganizationUuid: string;
        expectedProjectUuid: string;
    }): Promise<void> {
        const row = await this.registry.findBySandboxUuid(input.sandboxUuid);
        if (
            !row ||
            !SandboxManager.ownedBy(
                row,
                input.expectedOrganizationUuid,
                input.expectedProjectUuid,
            )
        ) {
            return;
        }
        await this.suspendOrphan(row);
    }

    /**
     * Permanently dispose of a sandbox: kill it, GC its snapshot, drop the row.
     * A row owned by a different org/project is treated as not-found and left
     * untouched (throws {@link SandboxExpiredError}).
     */
    async destroy(input: {
        sandboxUuid: string;
        handle?: SandboxHandle;
        expectedOrganizationUuid: string;
        expectedProjectUuid: string;
    }): Promise<void> {
        const row = await this.registry.findBySandboxUuid(input.sandboxUuid);
        if (
            row &&
            !SandboxManager.ownedBy(
                row,
                input.expectedOrganizationUuid,
                input.expectedProjectUuid,
            )
        ) {
            throw new SandboxExpiredError(input.sandboxUuid);
        }
        const liveId =
            input.handle?.sandboxId ?? row?.providerSandboxId ?? null;
        if (liveId) {
            await this.provider.destroy(liveId);
        }
        if (row?.snapshotRef) {
            await this.provider.deleteSnapshot(row.snapshotRef);
        }
        await this.registry.deleteBySandboxUuid(input.sandboxUuid);
    }

    private async suspendOrphan(row: SandboxRegistryRecord): Promise<void> {
        if (!row.providerSandboxId) {
            // No live sandbox to snapshot — nothing to preserve. The row's own
            // org/project trivially satisfy the ownership guard.
            await this.destroy({
                sandboxUuid: row.sandboxUuid,
                expectedOrganizationUuid: row.organizationUuid,
                expectedProjectUuid: row.projectUuid,
            });
            return;
        }
        const handle = await this.provider.connect(row.providerSandboxId);
        await this.suspend({
            sandboxUuid: row.sandboxUuid,
            handle,
        });
    }
}
