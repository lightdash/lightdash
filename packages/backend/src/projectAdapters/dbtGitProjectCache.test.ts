import * as fs from 'fs/promises';
import os from 'os';
import path from 'path';
import Logger from '../logging/logger';
import {
    acquireDbtGitProjectCache,
    configureDbtGitProjectCache,
    dbtGitCacheIdentityKey,
    invalidateDbtGitProjectCacheSource,
    invalidateOwnedDbtGitCacheLease,
    maintainDbtGitProjectCache,
    releaseDbtGitProjectCache,
    resolveLiveDbtGitCacheIdentities,
    type DbtGitCacheIdentity,
    type DbtGitCacheLease,
} from './dbtGitProjectCache';

vi.mock('fs/promises', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs/promises')>();
    return {
        ...actual,
        access: vi.fn(actual.access),
        readFile: vi.fn(actual.readFile),
        rename: vi.fn(actual.rename),
        rm: vi.fn(actual.rm),
    };
});

vi.mock('../logging/logger', () => ({
    default: {
        warn: vi.fn(),
    },
}));

const roots: string[] = [];

const identity = (index: number): DbtGitCacheIdentity => ({
    projectUuid: 'project',
    sourceUuid: `source-${index}`,
    sourceType: 'additional',
});

const configure = async (
    overrides: Partial<{ maxBytes: number; maxAgeMs: number }> = {},
) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dbt-cache-test-'));
    roots.push(root);
    configureDbtGitProjectCache({
        root,
        maxBytes: overrides.maxBytes ?? 1024 * 1024,
        maxAgeMs: overrides.maxAgeMs ?? 60_000,
        livenessCheck: async (identities) =>
            new Set(identities.map(dbtGitCacheIdentityKey)),
    });
    return root;
};

const entryDirectories = async (root: string) =>
    (await fs.readdir(root)).filter((name) => /^[a-f0-9]{64}$/.test(name));

const tombstoneDirectories = async (root: string) =>
    (await fs.readdir(root)).filter((name) => name.startsWith('.tombstone-'));

const staleOwner = (overrides: Record<string, unknown> = {}) => ({
    leaseId: '00000000-0000-4000-8000-000000000001',
    hostname: os.hostname(),
    pid: 2147483647,
    processStartTime: '1',
    heartbeatAt: Date.now() - 10 * 60_000,
    ...overrides,
});

const retainEntries = async (count: number) =>
    Array.from({ length: count }).reduce<Promise<DbtGitCacheLease[]>>(
        async (pendingLeases, _, index) => {
            const leases = await pendingLeases;
            const lease = await acquireDbtGitProjectCache(
                identity(index),
                `repository-${index}`,
            );
            await fs.mkdir(lease!.checkoutDirectory);
            await releaseDbtGitProjectCache(lease!, 1);
            return [...leases, lease!];
        },
        Promise.resolve([]),
    );

afterEach(async () => {
    vi.clearAllMocks();
    await Promise.all(
        roots
            .splice(0)
            .map((root) => fs.rm(root, { recursive: true, force: true })),
    );
});

describe('dbt git project cache', () => {
    it('uses exact primary and additional source membership semantics', () => {
        const identities: DbtGitCacheIdentity[] = [
            {
                projectUuid: 'explicit-primary-project',
                sourceUuid: 'explicit-primary-source',
                sourceType: 'primary',
            },
            {
                projectUuid: 'fallback-primary-project',
                sourceUuid: 'fallback-primary-project',
                sourceType: 'primary',
            },
            {
                projectUuid: 'wrong-fallback-project',
                sourceUuid: 'wrong-fallback-source',
                sourceType: 'primary',
            },
            {
                projectUuid: 'additional-project',
                sourceUuid: 'additional-source',
                sourceType: 'additional',
            },
            {
                projectUuid: 'wrong-additional-project',
                sourceUuid: 'additional-source',
                sourceType: 'additional',
            },
        ];
        const live = resolveLiveDbtGitCacheIdentities({
            identities,
            primaryRows: [
                {
                    projectUuid: 'explicit-primary-project',
                    dbtSourceUuid: 'explicit-primary-source',
                },
                {
                    projectUuid: 'fallback-primary-project',
                    dbtSourceUuid: null,
                },
                {
                    projectUuid: 'wrong-fallback-project',
                    dbtSourceUuid: null,
                },
            ],
            additionalRows: [
                {
                    projectUuid: 'additional-project',
                    projectDbtSourceUuid: 'additional-source',
                },
            ],
        });
        expect(live).toEqual(
            new Set(
                identities
                    .slice(0, 2)
                    .concat(identities[3])
                    .map(dbtGitCacheIdentityKey),
            ),
        );
    });

    it('retains simultaneous fitting checkouts for different sources', async () => {
        await configure();
        const leases = await Promise.all(
            Array.from({ length: 14 }, async (_, index) => {
                const lease = await acquireDbtGitProjectCache(
                    identity(index),
                    `repository-${index}`,
                );
                expect(lease).toBeDefined();
                await fs.mkdir(lease!.checkoutDirectory);
                await fs.writeFile(
                    path.join(lease!.checkoutDirectory, 'dbt_project.yml'),
                    'name: test\n',
                );
                return lease!;
            }),
        );
        await Promise.all(
            leases.map((lease) => releaseDbtGitProjectCache(lease, 100)),
        );
        const reused = await Promise.all(
            Array.from({ length: 14 }, (_, index) =>
                acquireDbtGitProjectCache(
                    identity(index),
                    `repository-${index}`,
                ),
            ),
        );
        expect(reused.every((lease) => lease?.reused)).toBe(true);
        await Promise.all(
            reused.map((lease) => releaseDbtGitProjectCache(lease!, 100)),
        );
    });

    it('deletes an invalidated active entry on release', async () => {
        const root = await configure();
        const lease = await acquireDbtGitProjectCache(
            identity(1),
            'repository',
        );
        expect(lease).toBeDefined();
        await fs.mkdir(lease!.checkoutDirectory);
        await invalidateDbtGitProjectCacheSource('project', 'source-1');
        await releaseDbtGitProjectCache(lease!, 100);
        expect(await entryDirectories(root)).toHaveLength(0);
        expect(lease).toMatchObject({
            retained: false,
            retentionReason: 'invalidated',
        });
    });

    it('reports successful and declined retention outcomes on leases', async () => {
        await configure({ maxBytes: 100 });
        const retained = await acquireDbtGitProjectCache(
            identity(1),
            'repository-1',
        );
        await fs.mkdir(retained!.checkoutDirectory);
        await releaseDbtGitProjectCache(retained!, 100);
        expect(retained).toMatchObject({ retained: true });
        expect(retained?.retentionReason).toBeUndefined();

        const declined = await acquireDbtGitProjectCache(
            identity(2),
            'repository-2',
        );
        await fs.mkdir(declined!.checkoutDirectory);
        await releaseDbtGitProjectCache(declined!, 101);
        expect(declined).toMatchObject({
            retained: false,
            retentionReason: 'entry-too-large',
        });
    });

    it('declines retention after lease ownership changes', async () => {
        await configure();
        const lease = await acquireDbtGitProjectCache(
            identity(1),
            'repository',
        );
        await fs.mkdir(lease!.checkoutDirectory);
        const currentOwner = JSON.parse(
            await fs.readFile(
                path.join(lease!.entryDirectory, 'lease', 'owner.json'),
                'utf8',
            ),
        );
        const replacementOwner = staleOwner({
            leaseId: '00000000-0000-4000-8000-000000000002',
            pid: process.pid,
            processStartTime: currentOwner.processStartTime,
            heartbeatAt: Date.now(),
        });
        await fs.writeFile(
            path.join(lease!.entryDirectory, 'lease', 'owner.json'),
            JSON.stringify(replacementOwner),
        );

        await releaseDbtGitProjectCache(lease!, 100);

        expect(lease).toMatchObject({
            retained: false,
            retentionReason: 'lease-lost',
        });
        expect(
            JSON.parse(
                await fs.readFile(
                    path.join(lease!.entryDirectory, 'metadata.json'),
                    'utf8',
                ),
            ),
        ).toMatchObject({ state: 'active' });
        expect(
            JSON.parse(
                await fs.readFile(
                    path.join(lease!.entryDirectory, 'lease', 'owner.json'),
                    'utf8',
                ),
            ),
        ).toEqual(replacementOwner);
    });

    it('reports a busy cache miss', async () => {
        await configure();
        const active = await acquireDbtGitProjectCache(
            identity(1),
            'repository',
        );
        const onMiss = vi.fn();

        const contender = await acquireDbtGitProjectCache(
            identity(1),
            'repository',
            onMiss,
        );

        expect(contender).toBeUndefined();
        expect(onMiss).toHaveBeenCalledExactlyOnceWith('busy');
        await invalidateOwnedDbtGitCacheLease(active!);
    });

    it('reports a corrupt cache miss', async () => {
        const root = await configure();
        const seed = await acquireDbtGitProjectCache(identity(1), 'repository');
        const { entryDirectory } = seed!;
        await invalidateOwnedDbtGitCacheLease(seed!);
        await fs.mkdir(entryDirectory, { mode: 0o700 });
        const onMiss = vi.fn();

        const lease = await acquireDbtGitProjectCache(
            identity(1),
            'repository',
            onMiss,
        );

        expect(lease).toBeUndefined();
        expect(onMiss).toHaveBeenCalledWith('corrupt');
        expect(await entryDirectories(root)).toHaveLength(1);
    });

    it('does not let an old release delete a reacquired generation', async () => {
        const root = await configure();
        const oldLease = await acquireDbtGitProjectCache(
            identity(1),
            'repository',
        );
        expect(oldLease).toBeDefined();
        await invalidateOwnedDbtGitCacheLease(oldLease!);
        const newLease = await acquireDbtGitProjectCache(
            identity(1),
            'repository',
        );
        expect(newLease).toBeDefined();
        await fs.mkdir(newLease!.checkoutDirectory);
        await releaseDbtGitProjectCache(oldLease!, 100);
        expect(await entryDirectories(root)).toHaveLength(1);
        await releaseDbtGitProjectCache(newLease!, 100);
        const reused = await acquireDbtGitProjectCache(
            identity(1),
            'repository',
        );
        expect(reused?.reused).toBe(true);
        await releaseDbtGitProjectCache(reused!, 100);
    });

    it('does not let paused tombstone cleanup delete a new generation', async () => {
        const root = await configure();
        const lease = await acquireDbtGitProjectCache(
            identity(1),
            'repository',
        );
        await fs.mkdir(lease!.checkoutDirectory);
        const actualFs =
            await vi.importActual<typeof import('fs/promises')>('fs/promises');
        const rm = vi.mocked(fs.rm);
        let startCleanup: () => void = () => undefined;
        let finishCleanup: () => void = () => undefined;
        const cleanupStarted = new Promise<void>((resolve) => {
            startCleanup = resolve;
        });
        const cleanupFinished = new Promise<void>((resolve) => {
            finishCleanup = resolve;
        });
        let paused = false;
        rm.mockImplementation(async (target, options) => {
            if (
                !paused &&
                typeof target === 'string' &&
                path.basename(target).startsWith('.tombstone-')
            ) {
                paused = true;
                startCleanup();
                await cleanupFinished;
            }
            return actualFs.rm(target, options);
        });
        try {
            await invalidateOwnedDbtGitCacheLease(lease!);
            await cleanupStarted;
            const replacement = await acquireDbtGitProjectCache(
                identity(1),
                'repository',
            );
            expect(replacement?.reused).toBe(false);
            await fs.mkdir(replacement!.checkoutDirectory);
            await fs.writeFile(
                path.join(replacement!.checkoutDirectory, 'current'),
                'current',
            );
            finishCleanup();
            await expect.poll(() => tombstoneDirectories(root)).toHaveLength(0);
            await expect(
                fs.readFile(
                    path.join(replacement!.checkoutDirectory, 'current'),
                    'utf8',
                ),
            ).resolves.toBe('current');
            await releaseDbtGitProjectCache(replacement!, 100);
        } finally {
            finishCleanup();
            rm.mockImplementation(actualFs.rm);
        }
    });

    it('drains an in-flight heartbeat before lease release and reacquire', async () => {
        await configure();
        const lease = await acquireDbtGitProjectCache(
            identity(1),
            'repository',
        );
        await fs.mkdir(lease!.checkoutDirectory);
        const actualFs =
            await vi.importActual<typeof import('fs/promises')>('fs/promises');
        const rename = vi.mocked(fs.rename);
        let startHeartbeat: () => void = () => undefined;
        let finishHeartbeat: () => void = () => undefined;
        const heartbeatStarted = new Promise<void>((resolve) => {
            startHeartbeat = resolve;
        });
        const heartbeatFinished = new Promise<void>((resolve) => {
            finishHeartbeat = resolve;
        });
        let pauseHeartbeat = true;
        rename.mockImplementation(async (oldPath, newPath) => {
            if (
                pauseHeartbeat &&
                typeof newPath === 'string' &&
                newPath.endsWith('/lease/owner.json') &&
                typeof oldPath === 'string' &&
                oldPath.includes('/lease/owner.json.')
            ) {
                pauseHeartbeat = false;
                startHeartbeat();
                await heartbeatFinished;
            }
            return actualFs.rename(oldPath, newPath);
        });
        try {
            lease!.heartbeat?.schedule();
            await heartbeatStarted;
            let released = false;
            const release = releaseDbtGitProjectCache(lease!, 100).then(() => {
                released = true;
            });
            await Promise.resolve();
            expect(released).toBe(false);
            finishHeartbeat();
            await release;
            const replacement = await acquireDbtGitProjectCache(
                identity(1),
                'repository',
            );
            expect(replacement?.reused).toBe(true);
            const ownerPath = path.join(
                replacement!.entryDirectory,
                'lease',
                'owner.json',
            );
            const ownerBefore = await fs.readFile(ownerPath, 'utf8');
            await Promise.resolve();
            expect(await fs.readFile(ownerPath, 'utf8')).toBe(ownerBefore);
            await releaseDbtGitProjectCache(replacement!, 100);
        } finally {
            finishHeartbeat();
            rename.mockImplementation(actualFs.rename);
        }
    });

    it('counts a failed tombstone cleanup against retained capacity', async () => {
        const root = await configure({ maxBytes: 1_000 });
        const lease = await acquireDbtGitProjectCache(
            identity(1),
            'repository-1',
        );
        await fs.mkdir(lease!.checkoutDirectory);
        const actualFs =
            await vi.importActual<typeof import('fs/promises')>('fs/promises');
        const rm = vi.mocked(fs.rm);
        let failTombstone = true;
        rm.mockImplementation(async (target, options) => {
            if (
                failTombstone &&
                typeof target === 'string' &&
                path.basename(target).startsWith('.tombstone-')
            ) {
                failTombstone = false;
                throw new Error('cleanup failed');
            }
            return actualFs.rm(target, options);
        });
        try {
            await invalidateOwnedDbtGitCacheLease(lease!);
            await expect.poll(() => tombstoneDirectories(root)).toHaveLength(1);
            await expect
                .poll(async () => {
                    const [tombstone] = await tombstoneDirectories(root);
                    return fs
                        .access(path.join(root, tombstone!, 'lease'))
                        .then(() => true)
                        .catch(() => false);
                })
                .toBe(false);
            const candidate = await acquireDbtGitProjectCache(
                identity(2),
                'repository-2',
            );
            await fs.mkdir(candidate!.checkoutDirectory);
            await releaseDbtGitProjectCache(candidate!, 100);
            const next = await acquireDbtGitProjectCache(
                identity(2),
                'repository-2',
            );
            expect(next?.reused).toBe(false);
            await invalidateOwnedDbtGitCacheLease(next!);
        } finally {
            rm.mockImplementation(actualFs.rm);
        }
        await maintainDbtGitProjectCache();
        await expect.poll(() => tombstoneDirectories(root)).toHaveLength(0);
    });

    it('does not publish while eviction cleanup remains charged', async () => {
        const root = await configure({ maxBytes: 150 });
        const first = await acquireDbtGitProjectCache(
            identity(1),
            'repository-1',
        );
        await fs.mkdir(first!.checkoutDirectory);
        await releaseDbtGitProjectCache(first!, 100);
        const second = await acquireDbtGitProjectCache(
            identity(2),
            'repository-2',
        );
        await fs.mkdir(second!.checkoutDirectory);
        const actualFs =
            await vi.importActual<typeof import('fs/promises')>('fs/promises');
        const rm = vi.mocked(fs.rm);
        let startCleanup: () => void = () => undefined;
        let finishCleanup: () => void = () => undefined;
        const cleanupStarted = new Promise<void>((resolve) => {
            startCleanup = resolve;
        });
        const cleanupFinished = new Promise<void>((resolve) => {
            finishCleanup = resolve;
        });
        rm.mockImplementation(async (target, options) => {
            if (
                typeof target === 'string' &&
                path.basename(target).startsWith(`.tombstone-${first!.key}-`)
            ) {
                startCleanup();
                await cleanupFinished;
            }
            return actualFs.rm(target, options);
        });
        try {
            let secondReleased = false;
            const secondRelease = releaseDbtGitProjectCache(second!, 100).then(
                () => {
                    secondReleased = true;
                },
            );
            await cleanupStarted;
            await Promise.resolve();
            expect(secondReleased).toBe(false);
            expect(await tombstoneDirectories(root)).toHaveLength(1);

            const third = await acquireDbtGitProjectCache(
                identity(3),
                'repository-3',
            );
            await fs.mkdir(third!.checkoutDirectory);
            await releaseDbtGitProjectCache(third!, 1);
            const thirdAgain = await acquireDbtGitProjectCache(
                identity(3),
                'repository-3',
            );
            expect(thirdAgain?.reused).toBe(false);
            await invalidateOwnedDbtGitCacheLease(thirdAgain!);

            finishCleanup();
            await secondRelease;
            const secondAgain = await acquireDbtGitProjectCache(
                identity(2),
                'repository-2',
            );
            expect(secondAgain?.reused).toBe(true);
            await releaseDbtGitProjectCache(secondAgain!, 100);
        } finally {
            finishCleanup();
            rm.mockImplementation(actualFs.rm);
        }
    });

    it('uses an independent cleanup wait after the lock budget is consumed', async () => {
        await configure({ maxBytes: 150 });
        const first = await acquireDbtGitProjectCache(
            identity(1),
            'repository-1',
        );
        await fs.mkdir(first!.checkoutDirectory);
        await releaseDbtGitProjectCache(first!, 100);
        const second = await acquireDbtGitProjectCache(
            identity(2),
            'repository-2',
        );
        await fs.mkdir(second!.checkoutDirectory);
        const actualFs =
            await vi.importActual<typeof import('fs/promises')>('fs/promises');
        const readFile = vi.mocked(fs.readFile);
        const rm = vi.mocked(fs.rm);
        const clock = { now: Date.now(), advanced: false };
        const now = vi.spyOn(Date, 'now').mockImplementation(() => clock.now);
        let finishCleanup: () => void = () => undefined;
        const cleanupStarted = new Promise<void>((resolve) => {
            rm.mockImplementation(async (target, options) => {
                if (
                    typeof target === 'string' &&
                    path
                        .basename(target)
                        .startsWith(`.tombstone-${first!.key}-`)
                ) {
                    resolve();
                    await new Promise<void>((finish) => {
                        finishCleanup = finish;
                    });
                }
                return actualFs.rm(target, options);
            });
        });
        readFile.mockImplementation(
            async (...args: Parameters<typeof fs.readFile>) => {
                if (
                    !clock.advanced &&
                    typeof args[0] === 'string' &&
                    args[0].endsWith('.lightdash-cache-entry.json')
                ) {
                    clock.advanced = true;
                    clock.now += 4_950;
                }
                return actualFs.readFile(...args);
            },
        );
        try {
            let released = false;
            const release = releaseDbtGitProjectCache(second!, 100).then(() => {
                released = true;
            });
            await cleanupStarted;
            await new Promise<void>((resolve) => {
                setTimeout(resolve, 100);
            });
            expect(released).toBe(false);
            finishCleanup();
            await release;
            const reused = await acquireDbtGitProjectCache(
                identity(2),
                'repository-2',
            );
            expect(reused?.reused).toBe(true);
            await releaseDbtGitProjectCache(reused!, 100);
        } finally {
            finishCleanup();
            now.mockRestore();
            readFile.mockImplementation(actualFs.readFile);
            rm.mockImplementation(actualFs.rm);
        }
    });

    it('allows only one contender to reclaim a stale entry lease', async () => {
        const root = await configure();
        const first = await acquireDbtGitProjectCache(
            identity(1),
            'repository',
        );
        expect(first).toBeDefined();
        await fs.mkdir(first!.checkoutDirectory);
        await releaseDbtGitProjectCache(first!, 100);
        const [entry] = await entryDirectories(root);
        const leaseDirectory = path.join(root, entry, 'lease');
        await fs.mkdir(leaseDirectory);
        await fs.writeFile(
            path.join(leaseDirectory, 'owner.json'),
            JSON.stringify(staleOwner()),
        );
        const contenders = await Promise.all([
            acquireDbtGitProjectCache(identity(1), 'repository'),
            acquireDbtGitProjectCache(identity(1), 'repository'),
        ]);
        expect(contenders.filter(Boolean)).toHaveLength(1);
        await releaseDbtGitProjectCache(contenders.find(Boolean)!, 100);
    });

    it('reclaims a foreign-host lease after five stale intervals', async () => {
        const root = await configure();
        const first = await acquireDbtGitProjectCache(
            identity(1),
            'repository',
        );
        await fs.mkdir(first!.checkoutDirectory);
        await releaseDbtGitProjectCache(first!, 100);
        const [entry] = await entryDirectories(root);
        const leaseDirectory = path.join(root, entry, 'lease');
        await fs.mkdir(leaseDirectory);
        await fs.writeFile(
            path.join(leaseDirectory, 'owner.json'),
            JSON.stringify(
                staleOwner({
                    hostname: 'terminated-pod',
                    heartbeatAt: Date.now() - 11 * 60_000,
                }),
            ),
        );

        const reclaimed = await acquireDbtGitProjectCache(
            identity(1),
            'repository',
        );

        expect(reclaimed?.reused).toBe(true);
        await releaseDbtGitProjectCache(reclaimed!, 100);
    });

    it('protects a foreign-host lease within five stale intervals', async () => {
        const root = await configure();
        const first = await acquireDbtGitProjectCache(
            identity(1),
            'repository',
        );
        await fs.mkdir(first!.checkoutDirectory);
        await releaseDbtGitProjectCache(first!, 100);
        const [entry] = await entryDirectories(root);
        const leaseDirectory = path.join(root, entry, 'lease');
        await fs.mkdir(leaseDirectory);
        await fs.writeFile(
            path.join(leaseDirectory, 'owner.json'),
            JSON.stringify(
                staleOwner({
                    hostname: 'active-pod',
                    heartbeatAt: Date.now() - 9 * 60_000,
                }),
            ),
        );

        await expect(
            acquireDbtGitProjectCache(identity(1), 'repository'),
        ).resolves.toBeUndefined();
        await expect(fs.access(leaseDirectory)).resolves.toBeUndefined();
    });

    it('serializes concurrent reclaim of a stale reservation lock', async () => {
        const root = await configure();
        const seed = await acquireDbtGitProjectCache(identity(0), 'seed');
        await fs.mkdir(seed!.checkoutDirectory);
        await releaseDbtGitProjectCache(seed!, 100);
        const reservationLock = path.join(root, '.reservation-lock');
        await fs.mkdir(reservationLock);
        await fs.writeFile(
            path.join(reservationLock, 'owner.json'),
            JSON.stringify(staleOwner()),
        );
        const contenders = await Promise.all([
            acquireDbtGitProjectCache(identity(1), 'repository-1'),
            acquireDbtGitProjectCache(identity(2), 'repository-2'),
        ]);
        expect(contenders.every(Boolean)).toBe(true);
        await Promise.all(
            contenders.map((lease) => invalidateOwnedDbtGitCacheLease(lease!)),
        );
    });

    it('protects a stale lease when an orphan reclaim claim exists', async () => {
        const root = await configure();
        const first = await acquireDbtGitProjectCache(
            identity(1),
            'repository',
        );
        await fs.mkdir(first!.checkoutDirectory);
        await releaseDbtGitProjectCache(first!, 100);
        const [entry] = await entryDirectories(root);
        const leaseDirectory = path.join(root, entry, 'lease');
        await fs.mkdir(leaseDirectory);
        await fs.writeFile(
            path.join(leaseDirectory, 'owner.json'),
            JSON.stringify(staleOwner()),
        );
        await fs.writeFile(
            path.join(leaseDirectory, '.reclaim.json'),
            JSON.stringify({
                claimId: '00000000-0000-4000-8000-000000000002',
                claimant: staleOwner({
                    leaseId: '00000000-0000-4000-8000-000000000002',
                    pid: process.pid,
                }),
            }),
        );
        await expect(
            acquireDbtGitProjectCache(identity(1), 'repository'),
        ).resolves.toBeUndefined();
        await expect(fs.access(leaseDirectory)).resolves.toBeUndefined();
    });

    it('does not reclaim a malformed lease owner', async () => {
        const root = await configure();
        const first = await acquireDbtGitProjectCache(
            identity(1),
            'repository',
        );
        await fs.mkdir(first!.checkoutDirectory);
        await releaseDbtGitProjectCache(first!, 100);
        const [entry] = await entryDirectories(root);
        const leaseDirectory = path.join(root, entry, 'lease');
        await fs.mkdir(leaseDirectory);
        await fs.writeFile(
            path.join(leaseDirectory, 'owner.json'),
            JSON.stringify(staleOwner({ pid: 1.5, heartbeatAt: Infinity })),
        );
        await expect(
            acquireDbtGitProjectCache(identity(1), 'repository'),
        ).resolves.toBeUndefined();
        await expect(fs.access(leaseDirectory)).resolves.toBeUndefined();
    });

    it('protects a lease when process identity cannot be read', async () => {
        const root = await configure();
        const first = await acquireDbtGitProjectCache(
            identity(1),
            'repository',
        );
        await fs.mkdir(first!.checkoutDirectory);
        await releaseDbtGitProjectCache(first!, 100);
        const [entry] = await entryDirectories(root);
        const leaseDirectory = path.join(root, entry, 'lease');
        await fs.mkdir(leaseDirectory);
        await fs.writeFile(
            path.join(leaseDirectory, 'owner.json'),
            JSON.stringify(
                staleOwner({
                    pid: process.pid,
                    processStartTime: '1',
                }),
            ),
        );
        const actualFs =
            await vi.importActual<typeof import('fs/promises')>('fs/promises');
        const readFile = vi.mocked(fs.readFile);
        readFile.mockImplementation(
            async (...args: Parameters<typeof fs.readFile>) => {
                if (args[0] === `/proc/${process.pid}/stat`) {
                    const error = new Error(
                        'permission denied',
                    ) as NodeJS.ErrnoException;
                    error.code = 'EACCES';
                    throw error;
                }
                return actualFs.readFile(...args);
            },
        );
        try {
            await expect(
                acquireDbtGitProjectCache(identity(1), 'repository'),
            ).resolves.toBeUndefined();
            await expect(fs.access(leaseDirectory)).resolves.toBeUndefined();
        } finally {
            readFile.mockImplementation(actualFs.readFile);
        }
    });

    it('evicts retained entries to fit the configured byte bound', async () => {
        await configure({ maxBytes: 150 });
        const first = await acquireDbtGitProjectCache(
            identity(1),
            'repository-1',
        );
        await fs.mkdir(first!.checkoutDirectory);
        await releaseDbtGitProjectCache(first!, 100);
        const second = await acquireDbtGitProjectCache(
            identity(2),
            'repository-2',
        );
        await fs.mkdir(second!.checkoutDirectory);
        await releaseDbtGitProjectCache(second!, 100);
        const reusedSecond = await acquireDbtGitProjectCache(
            identity(2),
            'repository-2',
        );
        expect(reusedSecond?.reused).toBe(true);
        const recreatedFirst = await acquireDbtGitProjectCache(
            identity(1),
            'repository-1',
        );
        expect(recreatedFirst?.reused).toBe(false);
        await invalidateOwnedDbtGitCacheLease(recreatedFirst!);
        await releaseDbtGitProjectCache(reusedSecond!, 100);
    });

    it('counts every hash-shaped root entry before creating another', async () => {
        const root = await configure();
        const seed = await acquireDbtGitProjectCache(identity(0), 'seed');
        await invalidateOwnedDbtGitCacheLease(seed!);
        await Promise.all(
            Array.from({ length: 128 }, (_, index) =>
                fs.writeFile(
                    path.join(root, index.toString(16).padStart(64, '0')),
                    'unowned',
                ),
            ),
        );
        const onMiss = vi.fn();
        await expect(
            acquireDbtGitProjectCache(identity(1), 'repository', onMiss),
        ).resolves.toBeUndefined();
        expect(onMiss).toHaveBeenCalledWith('entry-cap');
        expect(await entryDirectories(root)).toHaveLength(128);
    });

    it('reports a reservation lock timeout', async () => {
        const root = await configure();
        const seed = await acquireDbtGitProjectCache(identity(0), 'seed');
        await fs.mkdir(seed!.checkoutDirectory);
        await releaseDbtGitProjectCache(seed!, 1);
        const reservationLock = path.join(root, '.reservation-lock');
        await fs.mkdir(reservationLock);
        await fs.writeFile(
            path.join(reservationLock, 'owner.json'),
            JSON.stringify(
                staleOwner({
                    hostname: 'active-pod',
                    heartbeatAt: Date.now(),
                }),
            ),
        );
        const onMiss = vi.fn();
        const actualFs =
            await vi.importActual<typeof import('fs/promises')>('fs/promises');
        const readFile = vi.mocked(fs.readFile);
        const clock = { now: Date.now(), advanced: false };
        const now = vi.spyOn(Date, 'now').mockImplementation(() => clock.now);
        readFile.mockImplementation(
            async (...args: Parameters<typeof fs.readFile>) => {
                if (
                    !clock.advanced &&
                    args[0] === path.join(reservationLock, 'owner.json')
                ) {
                    clock.advanced = true;
                    clock.now += 6_000;
                }
                return actualFs.readFile(...args);
            },
        );
        try {
            await expect(
                acquireDbtGitProjectCache(identity(1), 'repository', onMiss),
            ).resolves.toBeUndefined();
            expect(onMiss).toHaveBeenCalledWith('lock-timeout');
        } finally {
            now.mockRestore();
            readFile.mockImplementation(actualFs.readFile);
        }
    });

    it('evicts the least recently used retained entry on admission', async () => {
        const root = await configure();
        const leases = await retainEntries(128);
        const oldestMetadataPath = path.join(
            leases[0].entryDirectory,
            'metadata.json',
        );
        const oldestMetadata = JSON.parse(
            await fs.readFile(oldestMetadataPath, 'utf8'),
        );
        await fs.writeFile(
            oldestMetadataPath,
            JSON.stringify({
                ...oldestMetadata,
                lastUsedAt: Date.now() - 30_000,
            }),
        );

        const admitted = await acquireDbtGitProjectCache(
            identity(128),
            'repository-128',
        );

        expect(admitted?.reused).toBe(false);
        expect(await entryDirectories(root)).toHaveLength(128);
        await expect(fs.access(leases[0].entryDirectory)).rejects.toThrow();
        await expect(
            fs.access(leases[1].entryDirectory),
        ).resolves.toBeUndefined();
        await invalidateOwnedDbtGitCacheLease(admitted!);
    });

    it('does not evict an active retained entry on admission', async () => {
        const root = await configure();
        const leases = await retainEntries(128);
        const oldestMetadataPath = path.join(
            leases[0].entryDirectory,
            'metadata.json',
        );
        const secondMetadataPath = path.join(
            leases[1].entryDirectory,
            'metadata.json',
        );
        const oldestMetadata = JSON.parse(
            await fs.readFile(oldestMetadataPath, 'utf8'),
        );
        const secondMetadata = JSON.parse(
            await fs.readFile(secondMetadataPath, 'utf8'),
        );
        await fs.writeFile(
            oldestMetadataPath,
            JSON.stringify({
                ...oldestMetadata,
                lastUsedAt: Date.now() - 30_000,
            }),
        );
        await fs.writeFile(
            secondMetadataPath,
            JSON.stringify({
                ...secondMetadata,
                lastUsedAt: Date.now() - 20_000,
            }),
        );
        const active = await acquireDbtGitProjectCache(
            identity(0),
            'repository-0',
        );

        const admitted = await acquireDbtGitProjectCache(
            identity(128),
            'repository-128',
        );

        expect(active?.reused).toBe(true);
        expect(admitted?.reused).toBe(false);
        expect(await entryDirectories(root)).toHaveLength(128);
        await expect(
            fs.access(leases[0].entryDirectory),
        ).resolves.toBeUndefined();
        await expect(fs.access(leases[1].entryDirectory)).rejects.toThrow();
        await releaseDbtGitProjectCache(active!, 1);
        await invalidateOwnedDbtGitCacheLease(admitted!);
    });

    it('reclaims an interrupted tombstone with a missing marker after the grace period', async () => {
        const root = await configure();
        const lease = await acquireDbtGitProjectCache(
            identity(1),
            'repository',
        );
        await fs.mkdir(lease!.checkoutDirectory);
        await releaseDbtGitProjectCache(lease!, 100);
        const tombstone = path.join(
            root,
            `.tombstone-${lease!.key}-00000000-0000-4000-8000-000000000001`,
        );
        await fs.rename(lease!.entryDirectory, tombstone);
        await fs.rm(path.join(tombstone, '.lightdash-cache-entry.json'));
        const stale = new Date(Date.now() - 6 * 60_000);
        await fs.utimes(tombstone, stale, stale);

        await maintainDbtGitProjectCache();

        expect(await tombstoneDirectories(root)).toHaveLength(0);
        const replacement = await acquireDbtGitProjectCache(
            identity(1),
            'repository',
        );
        await fs.mkdir(replacement!.checkoutDirectory);
        await releaseDbtGitProjectCache(replacement!, 100);
        const reused = await acquireDbtGitProjectCache(
            identity(1),
            'repository',
        );
        expect(reused?.reused).toBe(true);
        await releaseDbtGitProjectCache(reused!, 100);
    });

    it('reclaims a metadata-less crashed acquisition after the grace period', async () => {
        const root = await configure();
        const seed = await acquireDbtGitProjectCache(identity(1), 'repository');
        const { key } = seed!;
        await invalidateOwnedDbtGitCacheLease(seed!);
        const entryDirectory = path.join(root, key);
        await fs.mkdir(entryDirectory, { mode: 0o700 });
        const marker = path.join(entryDirectory, '.lightdash-cache-entry.json');
        await fs.writeFile(marker, JSON.stringify({ version: 1, key }), {
            mode: 0o600,
        });
        const stale = new Date(Date.now() - 6 * 60_000);
        await fs.utimes(marker, stale, stale);

        await maintainDbtGitProjectCache();

        expect(await entryDirectories(root)).toHaveLength(0);
    });

    it('reclaims orphaned root marker writes only after the grace period', async () => {
        const root = await configure();
        const temporaryPath = path.join(
            root,
            '.lightdash-dbt-git-cache.json.00000000-0000-4000-8000-000000000001.tmp',
        );
        await fs.writeFile(temporaryPath, '{}', { mode: 0o600 });

        await maintainDbtGitProjectCache();
        await expect(fs.access(temporaryPath)).resolves.toBeUndefined();

        const stale = new Date(Date.now() - 6 * 60_000);
        await fs.utimes(temporaryPath, stale, stale);
        await maintainDbtGitProjectCache();
        await expect(fs.access(temporaryPath)).rejects.toThrow();
    });

    it('protects an active unowned entry during abandoned object cleanup', async () => {
        const root = await configure();
        const lease = await acquireDbtGitProjectCache(
            identity(1),
            'repository',
        );
        await fs.mkdir(lease!.checkoutDirectory);
        const marker = path.join(
            lease!.entryDirectory,
            '.lightdash-cache-entry.json',
        );
        await fs.rm(marker);
        const stale = new Date(Date.now() - 6 * 60_000);
        await fs.utimes(lease!.entryDirectory, stale, stale);

        await maintainDbtGitProjectCache();

        await expect(fs.access(lease!.entryDirectory)).resolves.toBeUndefined();
        await fs.writeFile(
            marker,
            JSON.stringify({ version: 1, key: lease!.key }),
            { mode: 0o600 },
        );
        await releaseDbtGitProjectCache(lease!, 100);
    });

    it('warns with a reason when corrupt root state declines retention', async () => {
        const root = await configure();
        const lease = await acquireDbtGitProjectCache(
            identity(1),
            'repository',
        );
        await fs.mkdir(lease!.checkoutDirectory);
        await fs.mkdir(path.join(root, '0'.repeat(64)), { mode: 0o700 });

        await releaseDbtGitProjectCache(lease!, 100);

        expect(vi.mocked(Logger.warn)).toHaveBeenCalledWith(
            'Declined dbt git cache retention',
            { reason: 'corrupt-root-entry' },
        );
    });

    it('removes missing identities and retains entries on liveness errors', async () => {
        const root = await configure();
        const first = await acquireDbtGitProjectCache(
            identity(1),
            'repository',
        );
        await fs.mkdir(first!.checkoutDirectory);
        await releaseDbtGitProjectCache(first!, 100);
        configureDbtGitProjectCache({
            root,
            maxBytes: 1024,
            maxAgeMs: 60_000,
            livenessCheck: async () => {
                throw new Error('database unavailable');
            },
        });
        await maintainDbtGitProjectCache();
        expect(await entryDirectories(root)).toHaveLength(1);
        configureDbtGitProjectCache({
            root,
            maxBytes: 1024,
            maxAgeMs: 60_000,
            livenessCheck: async () => new Set(),
        });
        await maintainDbtGitProjectCache();
        expect(await entryDirectories(root)).toHaveLength(0);
    });

    it('defers maintenance deletion until an active lease releases', async () => {
        const root = await configure();
        const lease = await acquireDbtGitProjectCache(
            identity(1),
            'repository',
        );
        await fs.mkdir(lease!.checkoutDirectory);
        configureDbtGitProjectCache({
            root,
            maxBytes: 1024,
            maxAgeMs: 60_000,
            livenessCheck: async () => new Set(),
        });
        await maintainDbtGitProjectCache();
        expect(await entryDirectories(root)).toHaveLength(1);
        await releaseDbtGitProjectCache(lease!, 100);
        expect(await entryDirectories(root)).toHaveLength(0);
    });

    it('rejects an expired entry when it is acquired', async () => {
        const root = await configure({ maxAgeMs: 1 });
        const first = await acquireDbtGitProjectCache(
            identity(1),
            'repository',
        );
        await fs.mkdir(first!.checkoutDirectory);
        await releaseDbtGitProjectCache(first!, 100);
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 5);
        });
        const next = await acquireDbtGitProjectCache(identity(1), 'repository');
        expect(next?.reused).toBe(false);
        await invalidateOwnedDbtGitCacheLease(next!);
        expect(await entryDirectories(root)).toHaveLength(0);
    });

    it('refuses a symlinked cache root', async () => {
        const target = await fs.mkdtemp(
            path.join(os.tmpdir(), 'dbt-cache-target-'),
        );
        const link = `${target}-link`;
        roots.push(target, link);
        await fs.symlink(target, link);
        configureDbtGitProjectCache({
            root: link,
            maxBytes: 1024,
            maxAgeMs: 60_000,
            livenessCheck: async () => new Set(),
        });
        await expect(
            acquireDbtGitProjectCache(identity(1), 'repository'),
        ).rejects.toThrow('cache root');
    });

    it.each([0, -1])(
        'disables the cache without creating its root for maxBytes %s',
        async (maxBytes) => {
            const parent = await fs.mkdtemp(
                path.join(os.tmpdir(), 'dbt-cache-disabled-test-'),
            );
            roots.push(parent);
            const root = path.join(parent, 'cache');
            configureDbtGitProjectCache({
                root,
                maxBytes,
                maxAgeMs: 60_000,
                livenessCheck: async () => new Set(),
            });
            const onMiss = vi.fn();

            await expect(
                acquireDbtGitProjectCache(identity(1), 'repository', onMiss),
            ).resolves.toBeUndefined();

            expect(onMiss).toHaveBeenCalledWith('disabled');
            await expect(fs.access(root)).rejects.toThrow();
        },
    );

    it('warns when a filesystem inspection error is swallowed', async () => {
        await configure();
        const lease = await acquireDbtGitProjectCache(
            identity(1),
            'repository',
        );
        await fs.mkdir(lease!.checkoutDirectory);
        const access = vi.mocked(fs.access);
        const error = new Error('permission denied') as NodeJS.ErrnoException;
        error.code = 'EACCES';
        access.mockRejectedValueOnce(error);

        await releaseDbtGitProjectCache(lease!, 100);

        expect(vi.mocked(Logger.warn)).toHaveBeenCalledWith(
            'Failed to inspect dbt git cache path',
            { error },
        );
    });
});
