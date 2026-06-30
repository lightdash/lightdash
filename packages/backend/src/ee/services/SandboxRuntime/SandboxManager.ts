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
     * from the recorded snapshot (or reconnecting to a still-live one).
     */
    async resume(input: {
        sandboxUuid: string;
        spec: SandboxSpec;
    }): Promise<SandboxHandle> {
        const row = await this.registry.findBySandboxUuid(input.sandboxUuid);
        if (!row) {
            throw new SandboxExpiredError(input.sandboxUuid);
        }
        const handle = await this.resumeRow(row, input.spec);
        await this.registry.markRunning(input.sandboxUuid, handle.sandboxId);
        return handle;
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
     * is the resumable state). The workspace is passed in (or read from the
     * registry row by {@link suspendByUuid}) so a caller holding no handle can
     * still suspend.
     */
    async suspend(input: {
        sandboxUuid: string;
        handle: SandboxHandle;
        workspace: PersistentWorkspace;
    }): Promise<void> {
        const ref = await this.provider.persist(input.handle, {
            workspace: input.workspace,
        });
        if (this.provider.capabilities.pauseResume) {
            await this.registry.markSuspended(input.sandboxUuid, {
                snapshotRef: ref,
                providerSandboxId: input.handle.sandboxId,
            });
            return;
        }
        // Destroy before marking suspended, not after: if destroy throws, the
        // row stays `running` with its live `providerSandboxId`. That is
        // deliberately retryable — resume still works by reconnecting to the
        // live container. The row is only marked `suspended` (promising the
        // snapshot is the resumable state) once the container is actually gone.
        await this.provider.destroy(input.handle.sandboxId);
        await this.registry.markSuspended(input.sandboxUuid, {
            snapshotRef: ref,
            providerSandboxId: null,
        });
    }

    /**
     * Suspend a sandbox by its stable id alone — for callers (cancel,
     * soft-delete) that hold no live handle. Connects to the recorded container
     * then suspends it (snapshot + destroy on object-store backends), preserving
     * state for a later resume. A row with no live sandbox is GC'd (nothing to
     * preserve); an already-gone row is a no-op.
     */
    async suspendByUuid(sandboxUuid: string): Promise<void> {
        const row = await this.registry.findBySandboxUuid(sandboxUuid);
        if (!row) {
            return;
        }
        await this.suspendOrphan(row);
    }

    /** Permanently dispose of a sandbox: kill it, GC its snapshot, drop the row. */
    async destroy(input: {
        sandboxUuid: string;
        handle?: SandboxHandle;
    }): Promise<void> {
        const row = await this.registry.findBySandboxUuid(input.sandboxUuid);
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
            // No live sandbox to snapshot — nothing to preserve.
            await this.destroy({ sandboxUuid: row.sandboxUuid });
            return;
        }
        const handle = await this.provider.connect(row.providerSandboxId);
        await this.suspend({
            sandboxUuid: row.sandboxUuid,
            handle,
            workspace: row.workspace,
        });
    }
}
