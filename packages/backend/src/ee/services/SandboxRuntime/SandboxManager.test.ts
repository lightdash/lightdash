import {
    SandboxExpiredError,
    SandboxManager,
    type SandboxRegistryStore,
} from './SandboxManager';
import { type SnapshotStore } from './SnapshotStore';
import {
    type PersistentWorkspace,
    type SandboxCapabilities,
    type SandboxHandle,
    type SandboxLogger,
    type SandboxProvider,
    type SandboxSpec,
} from './types';

const logger: SandboxLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
};

const workspace: PersistentWorkspace = { include: ['/repo'], exclude: [] };
const spec: SandboxSpec = {
    templateRef: 'img',
    timeoutMs: 1000,
    egress: { allow: [] },
};

const makeHandle = (sandboxId: string): SandboxHandle =>
    ({ sandboxId }) as unknown as SandboxHandle;

const makeProvider = (
    pauseResume: boolean,
): import('vitest').Mocked<SandboxProvider> => {
    const capabilities: SandboxCapabilities = {
        isolation: pauseResume ? 'microvm' : 'container',
        pauseResume,
        egressAllowlist: false,
        warmPool: false,
        persistence: pauseResume ? 'memory' : 'objectstore',
    };
    return {
        capabilities,
        create: vi.fn().mockResolvedValue(makeHandle('live-1')),
        connect: vi.fn().mockResolvedValue(makeHandle('live-reconnect')),
        destroy: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn().mockResolvedValue(undefined),
        persist: vi
            .fn()
            .mockResolvedValue(
                pauseResume
                    ? { kind: 'e2b-paused', sandboxId: 'live-1' }
                    : { kind: 's3-tar', key: 'sandboxes/sb-1/snapshot.tar.gz' },
            ),
        resume: vi.fn().mockResolvedValue(makeHandle('live-restored')),
    } as unknown as import('vitest').Mocked<SandboxProvider>;
};

const makeRegistry = (): import('vitest').Mocked<SandboxRegistryStore> =>
    ({
        create: vi.fn().mockResolvedValue('sb-1'),
        findBySandboxUuid: vi.fn().mockResolvedValue(null),
        markRunning: vi.fn().mockResolvedValue(undefined),
        markSuspended: vi.fn().mockResolvedValue(undefined),
        touch: vi.fn().mockResolvedValue(undefined),
        deleteBySandboxUuid: vi.fn().mockResolvedValue(undefined),
        findIdleRunning: vi.fn().mockResolvedValue([]),
        findExpiredSuspended: vi.fn().mockResolvedValue([]),
    }) as unknown as import('vitest').Mocked<SandboxRegistryStore>;

const makeStore = (): import('vitest').Mocked<SnapshotStore> => ({
    put: vi.fn().mockResolvedValue(undefined),
    get: vi.fn(),
    delete: vi.fn().mockResolvedValue(undefined),
});

const makeManager = (
    provider: import('vitest').Mocked<SandboxProvider>,
    registry: import('vitest').Mocked<SandboxRegistryStore>,
    store: import('vitest').Mocked<SnapshotStore>,
) =>
    new SandboxManager({
        provider,
        providerKind: provider.capabilities.pauseResume ? 'e2b' : 'docker',
        snapshotStore: store,
        registryModel: registry,
        logger,
        idleTimeoutMs: 1000,
        snapshotRetentionMs: 5000,
    });

describe('SandboxManager', () => {
    it('acquire creates a sandbox and registers it', async () => {
        const provider = makeProvider(false);
        const registry = makeRegistry();
        const manager = makeManager(provider, registry, makeStore());

        const { sandboxUuid, handle } = await manager.acquire({
            spec,
            organizationUuid: 'org-1',
            projectUuid: 'proj-1',
            workspace,
        });

        expect(provider.create).toHaveBeenCalledWith(spec);
        expect(registry.create).toHaveBeenCalledWith({
            organizationUuid: 'org-1',
            projectUuid: 'proj-1',
            provider: 'docker',
            providerSandboxId: 'live-1',
            workspace,
        });
        expect(sandboxUuid).toBe('sb-1');
        expect(handle.sandboxId).toBe('live-1');
    });

    it('acquire destroys the sandbox and rethrows when the registry insert fails', async () => {
        const provider = makeProvider(false);
        const registry = makeRegistry();
        const insertError = new Error('registry insert failed');
        registry.create.mockRejectedValueOnce(insertError);
        const manager = makeManager(provider, registry, makeStore());

        await expect(
            manager.acquire({
                spec,
                organizationUuid: 'org-1',
                projectUuid: 'proj-1',
                workspace,
            }),
        ).rejects.toBe(insertError);

        // The orphan must be destroyed so the reaper isn't left a leak it can
        // never discover (no registry row).
        expect(provider.destroy).toHaveBeenCalledWith('live-1');
    });

    it('acquire still rethrows the registry error if destroying the orphan also fails', async () => {
        const provider = makeProvider(false);
        const registry = makeRegistry();
        const insertError = new Error('registry insert failed');
        registry.create.mockRejectedValueOnce(insertError);
        provider.destroy.mockRejectedValueOnce(new Error('destroy failed'));
        const manager = makeManager(provider, registry, makeStore());

        await expect(
            manager.acquire({
                spec,
                organizationUuid: 'org-1',
                projectUuid: 'proj-1',
                workspace,
            }),
        ).rejects.toBe(insertError);
        expect(provider.destroy).toHaveBeenCalledWith('live-1');
    });

    describe('suspend', () => {
        it('object-store backend snapshots then destroys the container', async () => {
            const provider = makeProvider(false);
            const registry = makeRegistry();
            const manager = makeManager(provider, registry, makeStore());

            await manager.suspend({
                sandboxUuid: 'sb-1',
                handle: makeHandle('live-1'),
                workspace,
            });

            expect(provider.persist).toHaveBeenCalledWith(
                expect.objectContaining({ sandboxId: 'live-1' }),
                {
                    workspace,
                    snapshotKey: 'sandboxes/sb-1/snapshot.tar.gz',
                },
            );
            expect(provider.destroy).toHaveBeenCalledWith('live-1');
            expect(registry.markSuspended).toHaveBeenCalledWith('sb-1', {
                snapshotRef: {
                    kind: 's3-tar',
                    key: 'sandboxes/sb-1/snapshot.tar.gz',
                },
                providerSandboxId: null,
            });
        });

        it('native-pause backend keeps the sandbox alive', async () => {
            const provider = makeProvider(true);
            const registry = makeRegistry();
            const manager = makeManager(provider, registry, makeStore());

            await manager.suspend({
                sandboxUuid: 'sb-1',
                handle: makeHandle('live-1'),
                workspace,
            });

            expect(provider.persist).toHaveBeenCalledTimes(1);
            expect(provider.destroy).not.toHaveBeenCalled();
            expect(registry.markSuspended).toHaveBeenCalledWith('sb-1', {
                snapshotRef: { kind: 'e2b-paused', sandboxId: 'live-1' },
                providerSandboxId: 'live-1',
            });
        });
    });

    describe('suspendByUuid', () => {
        it('connects to the live container then suspends (no handle needed)', async () => {
            const provider = makeProvider(false);
            const registry = makeRegistry();
            registry.findBySandboxUuid.mockResolvedValue({
                sandboxUuid: 'sb-1',
                organizationUuid: 'org-1',
                projectUuid: 'proj-1',
                providerSandboxId: 'live-running',
                snapshotRef: null,
                workspace,
                lastActivityAt: new Date(0),
            });
            const manager = makeManager(provider, registry, makeStore());

            await manager.suspendByUuid('sb-1');

            expect(provider.connect).toHaveBeenCalledWith('live-running');
            expect(provider.persist).toHaveBeenCalledTimes(1);
            expect(provider.destroy).toHaveBeenCalledWith('live-reconnect');
            expect(registry.markSuspended).toHaveBeenCalledWith('sb-1', {
                snapshotRef: {
                    kind: 's3-tar',
                    key: 'sandboxes/sb-1/snapshot.tar.gz',
                },
                providerSandboxId: null,
            });
        });

        it('GCs a row that has no live sandbox to preserve', async () => {
            const provider = makeProvider(false);
            const registry = makeRegistry();
            registry.findBySandboxUuid.mockResolvedValue({
                sandboxUuid: 'sb-1',
                organizationUuid: 'org-1',
                projectUuid: 'proj-1',
                providerSandboxId: null,
                snapshotRef: { kind: 's3-tar', key: 'k' },
                workspace,
                lastActivityAt: new Date(0),
            });
            const store = makeStore();
            const manager = makeManager(provider, registry, store);

            await manager.suspendByUuid('sb-1');

            expect(provider.connect).not.toHaveBeenCalled();
            expect(provider.persist).not.toHaveBeenCalled();
            expect(store.delete).toHaveBeenCalledWith('k');
            expect(registry.deleteBySandboxUuid).toHaveBeenCalledWith('sb-1');
        });

        it('is a no-op when the row is already gone', async () => {
            const provider = makeProvider(false);
            const registry = makeRegistry();
            registry.findBySandboxUuid.mockResolvedValue(null);
            const manager = makeManager(provider, registry, makeStore());

            await manager.suspendByUuid('sb-1');

            expect(provider.connect).not.toHaveBeenCalled();
            expect(registry.deleteBySandboxUuid).not.toHaveBeenCalled();
        });
    });

    describe('resume', () => {
        it('restores from the recorded snapshot and marks running', async () => {
            const provider = makeProvider(false);
            const registry = makeRegistry();
            registry.findBySandboxUuid.mockResolvedValue({
                sandboxUuid: 'sb-1',
                organizationUuid: 'org-1',
                projectUuid: 'proj-1',
                providerSandboxId: null,
                snapshotRef: { kind: 's3-tar', key: 'k' },
                workspace,
                lastActivityAt: new Date(0),
            });
            const manager = makeManager(provider, registry, makeStore());

            const handle = await manager.resume({ sandboxUuid: 'sb-1', spec });

            expect(provider.resume).toHaveBeenCalledWith(
                { kind: 's3-tar', key: 'k' },
                spec,
            );
            expect(registry.markRunning).toHaveBeenCalledWith(
                'sb-1',
                'live-restored',
            );
            expect(handle.sandboxId).toBe('live-restored');
        });

        it('resumes a migration-backfilled E2B thread by reconnecting to the paused sandbox', async () => {
            // Mirrors a row written by the registry migration's backfill: an
            // existing E2B writeback thread whose snapshot_ref is the paused
            // sandbox id. Picking the thread up again must reconnect to that
            // same E2B sandbox (no object storage involved).
            const provider = makeProvider(true);
            const registry = makeRegistry();
            const store = makeStore();
            registry.findBySandboxUuid.mockResolvedValue({
                sandboxUuid: 'sb-1',
                organizationUuid: 'org-1',
                projectUuid: 'proj-1',
                providerSandboxId: 'e2b-live-1',
                snapshotRef: { kind: 'e2b-paused', sandboxId: 'e2b-live-1' },
                workspace,
                lastActivityAt: new Date(0),
            });
            const manager = makeManager(provider, registry, store);

            const handle = await manager.resume({ sandboxUuid: 'sb-1', spec });

            expect(provider.resume).toHaveBeenCalledWith(
                { kind: 'e2b-paused', sandboxId: 'e2b-live-1' },
                spec,
            );
            // The paused VM is the snapshot — resume must not read from S3.
            expect(store.get).not.toHaveBeenCalled();
            expect(registry.markRunning).toHaveBeenCalledWith(
                'sb-1',
                'live-restored',
            );
            expect(handle.sandboxId).toBe('live-restored');
        });

        it('throws SandboxExpiredError when the row is gone', async () => {
            const provider = makeProvider(false);
            const registry = makeRegistry();
            registry.findBySandboxUuid.mockResolvedValue(null);
            const manager = makeManager(provider, registry, makeStore());

            await expect(
                manager.resume({ sandboxUuid: 'sb-1', spec }),
            ).rejects.toBeInstanceOf(SandboxExpiredError);
        });
    });

    it('destroy kills the sandbox, GCs the snapshot and drops the row', async () => {
        const provider = makeProvider(false);
        const registry = makeRegistry();
        registry.findBySandboxUuid.mockResolvedValue({
            sandboxUuid: 'sb-1',
            organizationUuid: 'org-1',
            projectUuid: 'proj-1',
            providerSandboxId: null,
            snapshotRef: { kind: 's3-tar', key: 'k' },
            workspace,
            lastActivityAt: new Date(0),
        });
        const store = makeStore();
        const manager = makeManager(provider, registry, store);

        await manager.destroy({
            sandboxUuid: 'sb-1',
            handle: makeHandle('live-1'),
        });

        expect(provider.destroy).toHaveBeenCalledWith('live-1');
        expect(store.delete).toHaveBeenCalledWith('k');
        expect(registry.deleteBySandboxUuid).toHaveBeenCalledWith('sb-1');
    });

    describe('reapIdle', () => {
        it('suspends idle running sandboxes and GCs expired snapshots', async () => {
            const provider = makeProvider(false);
            const registry = makeRegistry();
            registry.findIdleRunning.mockResolvedValue([
                {
                    sandboxUuid: 'idle-1',
                    organizationUuid: 'org-1',
                    projectUuid: 'proj-1',
                    providerSandboxId: 'live-idle',
                    snapshotRef: null,
                    workspace,
                    lastActivityAt: new Date(0),
                },
            ]);
            registry.findExpiredSuspended.mockResolvedValue([
                {
                    sandboxUuid: 'expired-1',
                    organizationUuid: 'org-1',
                    projectUuid: 'proj-1',
                    providerSandboxId: null,
                    snapshotRef: { kind: 's3-tar', key: 'old' },
                    workspace,
                    lastActivityAt: new Date(0),
                },
            ]);
            // destroy() re-reads the row; return the expired one for its lookup.
            registry.findBySandboxUuid.mockResolvedValue({
                sandboxUuid: 'expired-1',
                organizationUuid: 'org-1',
                projectUuid: 'proj-1',
                providerSandboxId: null,
                snapshotRef: { kind: 's3-tar', key: 'old' },
                workspace,
                lastActivityAt: new Date(0),
            });
            const store = makeStore();
            const manager = makeManager(provider, registry, store);

            const result = await manager.reapIdle();

            // Idle orphan: reconnected, persisted, destroyed.
            expect(provider.connect).toHaveBeenCalledWith('live-idle');
            expect(provider.persist).toHaveBeenCalledTimes(1);
            // Expired snapshot GC'd.
            expect(store.delete).toHaveBeenCalledWith('old');
            expect(result).toEqual({ suspended: 1, gced: 1 });
        });
    });
});
