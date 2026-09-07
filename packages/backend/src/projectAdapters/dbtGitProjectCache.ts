import { createHash, randomUUID } from 'crypto';
import type { Stats } from 'fs';
import * as fs from 'fs/promises';
import os from 'os';
import path from 'path';
import Logger from '../logging/logger';

export const DBT_GIT_CACHE_DEFAULT_MAX_BYTES = 2 * 1024 * 1024 * 1024;
export const DBT_GIT_CACHE_DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const DBT_GIT_CACHE_MAINTENANCE_INTERVAL_MS = 15 * 60 * 1000;
export const DBT_GIT_CACHE_MAX_ENTRIES = 128;

const CACHE_VERSION = 1;
const LEASE_STALE_MS = 2 * 60 * 1000;
const FOREIGN_HOST_LEASE_STALE_MS = 5 * LEASE_STALE_MS;
const ROOT_MARKER = '.lightdash-dbt-git-cache.json';
const ENTRY_MARKER = '.lightdash-cache-entry.json';
const METADATA = 'metadata.json';
const LEASE_DIRECTORY = 'lease';
const LEASE_OWNER = 'owner.json';
const PENDING_DELETE = 'pending-delete';
const CACHE_LOCK = '.reservation-lock';
const RECLAIM_CLAIM = '.reclaim.json';
const CACHE_LOCK_WAIT_MS = 5_000;
const TOMBSTONE_CLEANUP_WAIT_MS = 30_000;
const RETENTION_TOTAL_WAIT_MS = 60_000;
const PUBLICATION_MAX_ATTEMPTS = DBT_GIT_CACHE_MAX_ENTRIES;
const ABANDONED_ROOT_GRACE_MS = 5 * 60 * 1000;
const ORPHAN_TEMPORARY_FILE =
    /^\.lightdash-dbt-git-cache\.json\.[0-9a-f-]{36}\.tmp$/;
const RETIRED_TEMPORARY_FILE = /^\.retired-[0-9a-f-]{36}\.tmp$/;

export type DbtGitCacheIdentity = {
    projectUuid: string;
    sourceUuid: string;
    sourceType: 'primary' | 'additional';
};

export type DbtGitCacheLivenessCheck = (
    identities: DbtGitCacheIdentity[],
) => Promise<Set<string>>;

type CacheConfiguration = {
    root: string;
    maxBytes: number;
    maxAgeMs: number;
    livenessCheck?: DbtGitCacheLivenessCheck;
};

type EntryMetadata = {
    version: number;
    key: string;
    identity: DbtGitCacheIdentity;
    repositoryIdentity: string;
    state: 'active' | 'retained';
    sizeBytes: number;
    lastUsedAt: number;
};

type LeaseOwner = {
    leaseId: string;
    hostname: string;
    pid: number;
    processStartTime: string | null;
    heartbeatAt: number;
};

type ReclaimClaim = {
    claimId: string;
    claimant: LeaseOwner;
};

type LeaseHeartbeat = {
    timer: NodeJS.Timeout;
    pending: Promise<void>;
    stopped: boolean;
    schedule: () => void;
};

type DirectoryLease = {
    leaseId: string;
    directory: string;
    heartbeat?: LeaseHeartbeat;
};

type TombstoneRetirement = {
    cleanup: Promise<boolean>;
};

export type DbtGitCacheLease = {
    key: string;
    entryDirectory: string;
    checkoutDirectory: string;
    depsMarkerPath: string;
    leaseId: string;
    reused: boolean;
    invalidated: boolean;
    closed: boolean;
    retained?: boolean;
    retentionReason?: string;
    heartbeat?: LeaseHeartbeat;
};

type OwnedEntry = {
    key: string;
    entryDirectory: string;
    kind: 'entry' | 'tombstone';
    owned: boolean;
    metadata?: EntryMetadata;
};

type RootDebris = {
    path: string;
    stat: Stats;
};

const activeLeases = new Map<string, DbtGitCacheLease>();
let maintenanceTimer: NodeJS.Timeout | undefined;
let configuration: CacheConfiguration = {
    root: path.join(os.tmpdir(), 'lightdash-dbt-git-cache'),
    maxBytes: DBT_GIT_CACHE_DEFAULT_MAX_BYTES,
    maxAgeMs: DBT_GIT_CACHE_DEFAULT_MAX_AGE_MS,
};

export const dbtGitCacheIdentityKey = (identity: DbtGitCacheIdentity): string =>
    `${identity.sourceType}:${identity.projectUuid}:${identity.sourceUuid}`;

export const resolveLiveDbtGitCacheIdentities = (args: {
    identities: DbtGitCacheIdentity[];
    primaryRows: Array<{
        projectUuid: string;
        dbtSourceUuid: string | null;
    }>;
    additionalRows: Array<{
        projectUuid: string;
        projectDbtSourceUuid: string;
    }>;
}): Set<string> => {
    const primaryRows = new Map(
        args.primaryRows.map((project) => [project.projectUuid, project]),
    );
    const additionalRows = new Map(
        args.additionalRows.map((source) => [
            source.projectDbtSourceUuid,
            source,
        ]),
    );
    return new Set(
        args.identities.flatMap((identity) => {
            if (identity.sourceType === 'primary') {
                const project = primaryRows.get(identity.projectUuid);
                const live =
                    project !== undefined &&
                    (project.dbtSourceUuid === identity.sourceUuid ||
                        (project.dbtSourceUuid === null &&
                            project.projectUuid === identity.sourceUuid));
                return live ? [dbtGitCacheIdentityKey(identity)] : [];
            }
            const source = additionalRows.get(identity.sourceUuid);
            return source?.projectUuid === identity.projectUuid
                ? [dbtGitCacheIdentityKey(identity)]
                : [];
        }),
    );
};

const isIdentity = (value: unknown): value is DbtGitCacheIdentity => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<DbtGitCacheIdentity>;
    return (
        typeof candidate.projectUuid === 'string' &&
        typeof candidate.sourceUuid === 'string' &&
        (candidate.sourceType === 'primary' ||
            candidate.sourceType === 'additional')
    );
};

const isMetadata = (value: unknown): value is EntryMetadata => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<EntryMetadata>;
    return (
        candidate.version === CACHE_VERSION &&
        typeof candidate.key === 'string' &&
        isIdentity(candidate.identity) &&
        typeof candidate.repositoryIdentity === 'string' &&
        (candidate.state === 'active' || candidate.state === 'retained') &&
        typeof candidate.sizeBytes === 'number' &&
        Number.isFinite(candidate.sizeBytes) &&
        candidate.sizeBytes >= 0 &&
        typeof candidate.lastUsedAt === 'number' &&
        Number.isFinite(candidate.lastUsedAt)
    );
};

const isLeaseOwner = (value: unknown): value is LeaseOwner => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<LeaseOwner>;
    return (
        typeof candidate.leaseId === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            candidate.leaseId,
        ) &&
        typeof candidate.hostname === 'string' &&
        candidate.hostname.length > 0 &&
        typeof candidate.pid === 'number' &&
        Number.isSafeInteger(candidate.pid) &&
        candidate.pid > 0 &&
        ((typeof candidate.processStartTime === 'string' &&
            /^\d+$/.test(candidate.processStartTime)) ||
            candidate.processStartTime === null) &&
        typeof candidate.heartbeatAt === 'number' &&
        Number.isFinite(candidate.heartbeatAt) &&
        candidate.heartbeatAt >= 0
    );
};

const isReclaimClaim = (value: unknown): value is ReclaimClaim => {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<ReclaimClaim>;
    return (
        typeof candidate.claimId === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
            candidate.claimId,
        ) &&
        isLeaseOwner(candidate.claimant)
    );
};

const keyFor = (
    identity: DbtGitCacheIdentity,
    repositoryIdentity: string,
): string =>
    createHash('sha256')
        .update(JSON.stringify({ identity, repositoryIdentity }))
        .digest('hex');

const warnSwallowedFilesystemError = (message: string, error: unknown) => {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        Logger.warn(message, { error });
    }
};

const readJson = async (filePath: string): Promise<unknown> => {
    let contents: string;
    try {
        contents = await fs.readFile(filePath, 'utf8');
    } catch (error) {
        warnSwallowedFilesystemError(
            'Failed to read dbt git cache JSON',
            error,
        );
        return undefined;
    }
    try {
        return JSON.parse(contents);
    } catch (error) {
        Logger.warn('Failed to parse dbt git cache JSON', { error });
        return undefined;
    }
};

const pathExists = async (filePath: string) => {
    try {
        await fs.access(filePath);
        return true;
    } catch (error) {
        warnSwallowedFilesystemError(
            'Failed to inspect dbt git cache path',
            error,
        );
        return false;
    }
};

const atomicWriteJson = async (filePath: string, value: unknown) => {
    const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
    try {
        await fs.writeFile(temporaryPath, JSON.stringify(value), {
            mode: 0o600,
        });
        await fs.rename(temporaryPath, filePath);
    } catch (error) {
        await fs.rm(temporaryPath, { force: true }).catch((cleanupError) => {
            warnSwallowedFilesystemError(
                'Failed to remove dbt git cache temporary file',
                cleanupError,
            );
        });
        throw error;
    }
};

const isPrivateOwnedStat = (stat: Stats) =>
    Number(stat.uid) === process.getuid?.() && Number(stat.mode) % 0o100 === 0;

const ensureRoot = async () => {
    await fs.mkdir(configuration.root, { recursive: true, mode: 0o700 });
    const stat = await fs.lstat(configuration.root);
    if (
        !stat.isDirectory() ||
        stat.isSymbolicLink() ||
        !isPrivateOwnedStat(stat)
    ) {
        throw new Error('Invalid dbt git cache root ownership');
    }
    const realRoot = await fs.realpath(configuration.root);
    if (realRoot !== path.resolve(configuration.root)) {
        throw new Error('Invalid dbt git cache root path');
    }
    const markerPath = path.join(configuration.root, ROOT_MARKER);
    let markerStat: Stats;
    try {
        markerStat = await fs.lstat(markerPath);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        await atomicWriteJson(markerPath, { version: CACHE_VERSION });
        markerStat = await fs.lstat(markerPath);
    }
    const marker = await readJson(markerPath);
    if (
        !markerStat.isFile() ||
        markerStat.isSymbolicLink() ||
        !isPrivateOwnedStat(markerStat) ||
        !marker ||
        typeof marker !== 'object' ||
        (marker as { version?: unknown }).version !== CACHE_VERSION
    ) {
        throw new Error('Invalid dbt git cache root marker');
    }
};

const isOwnedEntry = async (key: string, entryDirectory: string) => {
    if (!/^[a-f0-9]{64}$/.test(key)) return false;
    try {
        const stat = await fs.lstat(entryDirectory);
        if (
            !stat.isDirectory() ||
            stat.isSymbolicLink() ||
            !isPrivateOwnedStat(stat)
        ) {
            return false;
        }
        const realRoot = await fs.realpath(configuration.root);
        const realEntry = await fs.realpath(entryDirectory);
        if (path.dirname(realEntry) !== realRoot) return false;
        const markerPath = path.join(entryDirectory, ENTRY_MARKER);
        const markerStat = await fs.lstat(markerPath);
        if (
            !markerStat.isFile() ||
            markerStat.isSymbolicLink() ||
            !isPrivateOwnedStat(markerStat)
        ) {
            return false;
        }
        const marker = await readJson(markerPath);
        return (
            !!marker &&
            typeof marker === 'object' &&
            (marker as { version?: unknown }).version === CACHE_VERSION &&
            (marker as { key?: unknown }).key === key
        );
    } catch (error) {
        warnSwallowedFilesystemError(
            'Failed to inspect dbt git cache entry',
            error,
        );
        return false;
    }
};

const listOwnedEntries = async (): Promise<OwnedEntry[]> => {
    await ensureRoot();
    const directoryEntries = await fs.readdir(configuration.root, {
        withFileTypes: true,
    });
    type RootCandidate = {
        entry: (typeof directoryEntries)[number];
        key: string;
        kind: 'entry' | 'tombstone';
    };
    const candidates = directoryEntries.flatMap((entry): RootCandidate[] => {
        if (/^[a-f0-9]{64}$/.test(entry.name)) {
            return [{ entry, key: entry.name, kind: 'entry' as const }];
        }
        const match = entry.name.match(
            /^\.tombstone-([a-f0-9]{64})-[0-9a-f-]{36}$/,
        );
        return match
            ? [{ entry, key: match[1], kind: 'tombstone' as const }]
            : [];
    });
    const entries = await Promise.all(
        candidates.map(async ({ entry, key, kind }): Promise<OwnedEntry> => {
            const entryDirectory = path.join(configuration.root, entry.name);
            const owned = await isOwnedEntry(key, entryDirectory);
            if (!owned) {
                return {
                    key,
                    entryDirectory,
                    kind,
                    owned: false,
                };
            }
            const value = await readJson(path.join(entryDirectory, METADATA));
            return {
                key,
                entryDirectory,
                kind,
                owned: true,
                metadata: isMetadata(value) ? value : undefined,
            };
        }),
    );
    return entries;
};

const listRootDebris = async (): Promise<RootDebris[]> => {
    await ensureRoot();
    const entries = await fs.readdir(configuration.root, {
        withFileTypes: true,
    });
    return Promise.all(
        entries
            .flatMap((entry) =>
                ORPHAN_TEMPORARY_FILE.test(entry.name) ||
                RETIRED_TEMPORARY_FILE.test(entry.name)
                    ? [path.join(configuration.root, entry.name)]
                    : [],
            )
            .map(async (candidatePath) => {
                const stat = await fs.lstat(candidatePath).catch((error) => {
                    warnSwallowedFilesystemError(
                        'Failed to inspect dbt git cache root object',
                        error,
                    );
                    return undefined;
                });
                return stat ? { path: candidatePath, stat } : undefined;
            }),
    ).then((values) =>
        values.filter((value): value is RootDebris => value !== undefined),
    );
};

const isSameFile = (left: Stats, right: Stats) =>
    Number(left.dev) === Number(right.dev) &&
    Number(left.ino) === Number(right.ino);

const isPrivateRootChild = async (
    candidatePath: string,
    expectedStat: Stats,
    kind: 'directory' | 'file',
) => {
    if (
        path.dirname(path.resolve(candidatePath)) !==
        path.resolve(configuration.root)
    ) {
        return false;
    }
    const currentStat = await fs.lstat(candidatePath).catch((error) => {
        warnSwallowedFilesystemError(
            'Failed to verify dbt git cache root object',
            error,
        );
        return undefined;
    });
    return (
        currentStat !== undefined &&
        isSameFile(currentStat, expectedStat) &&
        !currentStat.isSymbolicLink() &&
        isPrivateOwnedStat(currentStat) &&
        (kind === 'directory'
            ? currentStat.isDirectory()
            : currentStat.isFile())
    );
};

const processStartTime = async (
    pid: number,
): Promise<
    | { status: 'found'; value: string }
    | { status: 'missing' }
    | { status: 'unknown' }
> => {
    try {
        const stat = await fs.readFile(`/proc/${pid}/stat`, 'utf8');
        const value = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
        return value ? { status: 'found', value } : { status: 'unknown' };
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return { status: 'missing' };
        }
        Logger.warn('Failed to inspect dbt git cache lease process', { error });
        return { status: 'unknown' };
    }
};

const newLeaseOwner = async (leaseId: string): Promise<LeaseOwner> => ({
    leaseId,
    hostname: os.hostname(),
    pid: process.pid,
    processStartTime: await processStartTime(process.pid).then((result) =>
        result.status === 'found' ? result.value : null,
    ),
    heartbeatAt: Date.now(),
});

const leaseOwnerIsProvablyStale = async (
    value: LeaseOwner,
): Promise<boolean> => {
    if (value.hostname !== os.hostname()) {
        return Date.now() - value.heartbeatAt > FOREIGN_HOST_LEASE_STALE_MS;
    }
    if (Date.now() - value.heartbeatAt <= LEASE_STALE_MS) return false;
    const actualStartTime = await processStartTime(value.pid);
    return (
        actualStartTime.status === 'missing' ||
        (actualStartTime.status === 'found' &&
            value.processStartTime !== null &&
            actualStartTime.value !== value.processStartTime)
    );
};

const removeAgedReclaimClaim = async (claimPath: string): Promise<boolean> => {
    try {
        const observedStat: Stats = await fs.lstat(claimPath);
        const observed = await readJson(claimPath);
        if (Date.now() - observedStat.mtimeMs <= LEASE_STALE_MS) return false;
        const currentStat: Stats = await fs.lstat(claimPath);
        const current = await readJson(claimPath);
        if (
            currentStat.dev !== observedStat.dev ||
            currentStat.ino !== observedStat.ino ||
            currentStat.mtimeMs !== observedStat.mtimeMs ||
            currentStat.size !== observedStat.size ||
            (isReclaimClaim(observed) &&
                (!isReclaimClaim(current) ||
                    current.claimId !== observed.claimId ||
                    current.claimant.leaseId !== observed.claimant.leaseId ||
                    current.claimant.heartbeatAt !==
                        observed.claimant.heartbeatAt))
        ) {
            return false;
        }
        await fs.rm(claimPath, { force: true });
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true;
        warnSwallowedFilesystemError(
            'Failed to inspect stale dbt git cache reclaim claim',
            error,
        );
        return false;
    }
};

const claimAndRemoveStaleLease = async (
    leaseDirectory: string,
): Promise<boolean> => {
    const observed = await readJson(path.join(leaseDirectory, LEASE_OWNER));
    if (
        !isLeaseOwner(observed) ||
        !(await leaseOwnerIsProvablyStale(observed))
    ) {
        return false;
    }
    const claimPath = path.join(leaseDirectory, RECLAIM_CLAIM);
    const claimId = randomUUID();
    const claim = JSON.stringify({
        claimId,
        claimant: await newLeaseOwner(claimId),
    });
    const tryClaim = async (): Promise<'claimed' | 'exists' | 'failed'> => {
        try {
            await fs.writeFile(claimPath, claim, {
                flag: 'wx',
                mode: 0o600,
            });
            return 'claimed';
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'EEXIST')
                return 'exists';
            warnSwallowedFilesystemError(
                'Failed to claim stale dbt git cache lease',
                error,
            );
            return 'failed';
        }
    };
    let claimResult = await tryClaim();
    if (claimResult === 'exists' && (await removeAgedReclaimClaim(claimPath))) {
        claimResult = await tryClaim();
    }
    if (claimResult !== 'claimed') return false;
    try {
        const current = await readJson(path.join(leaseDirectory, LEASE_OWNER));
        if (
            !isLeaseOwner(current) ||
            current.leaseId !== observed.leaseId ||
            current.hostname !== observed.hostname ||
            current.pid !== observed.pid ||
            current.processStartTime !== observed.processStartTime ||
            current.heartbeatAt !== observed.heartbeatAt ||
            !(await leaseOwnerIsProvablyStale(current))
        ) {
            return false;
        }
        const staleDirectory = `${leaseDirectory}.stale-${claimId}`;
        await fs.rename(leaseDirectory, staleDirectory);
        await fs.rm(staleDirectory, { recursive: true, force: true });
        return true;
    } catch (error) {
        warnSwallowedFilesystemError(
            'Failed to remove stale dbt git cache lease',
            error,
        );
        return false;
    } finally {
        const currentClaim = await readJson(claimPath);
        if (
            currentClaim &&
            typeof currentClaim === 'object' &&
            (currentClaim as { claimId?: unknown }).claimId === claimId
        ) {
            await fs.rm(claimPath, { force: true }).catch((error) => {
                warnSwallowedFilesystemError(
                    'Failed to remove dbt git cache reclaim claim',
                    error,
                );
            });
        }
    }
};

const tryCreateDirectoryLease = async (
    leaseDirectory: string,
    withHeartbeat: boolean,
): Promise<DirectoryLease | undefined> => {
    const create = async (): Promise<boolean> => {
        try {
            await fs.mkdir(leaseDirectory, { mode: 0o700 });
            return true;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'EEXIST')
                return false;
            throw error;
        }
    };
    if (!(await create())) {
        if (!(await claimAndRemoveStaleLease(leaseDirectory))) return undefined;
        if (!(await create())) return undefined;
    }
    const leaseId = randomUUID();
    const ownerPath = path.join(leaseDirectory, LEASE_OWNER);
    const writeHeartbeat = async () =>
        atomicWriteJson(ownerPath, await newLeaseOwner(leaseId));
    try {
        await writeHeartbeat();
    } catch (error) {
        await fs.rm(leaseDirectory, { recursive: true, force: true });
        throw error;
    }
    let heartbeat: LeaseHeartbeat | undefined;
    if (withHeartbeat) {
        const state = {
            pending: Promise.resolve(),
            stopped: false,
            schedule: () => undefined,
        } as Omit<LeaseHeartbeat, 'timer'>;
        state.schedule = () => {
            if (state.stopped) return;
            state.pending = state.pending
                .then(async () => {
                    if (state.stopped) return;
                    const current = await readJson(ownerPath);
                    if (isLeaseOwner(current) && current.leaseId === leaseId) {
                        await writeHeartbeat();
                    }
                })
                .catch((error) => {
                    warnSwallowedFilesystemError(
                        'Failed to update dbt git cache lease heartbeat',
                        error,
                    );
                });
        };
        const timer = setInterval(state.schedule, 30_000);
        timer.unref();
        heartbeat = Object.assign(state, { timer });
    }
    return { leaseId, directory: leaseDirectory, heartbeat };
};

const stopHeartbeat = async (heartbeat: LeaseHeartbeat | undefined) => {
    if (!heartbeat) return;
    Object.assign(heartbeat, { stopped: true });
    clearInterval(heartbeat.timer);
    await heartbeat.pending.catch((error) => {
        warnSwallowedFilesystemError(
            'Failed to drain dbt git cache lease heartbeat',
            error,
        );
    });
};

const releaseDirectoryLease = async (lease: DirectoryLease) => {
    await stopHeartbeat(lease.heartbeat);
    const value = await readJson(path.join(lease.directory, LEASE_OWNER));
    if (isLeaseOwner(value) && value.leaseId === lease.leaseId) {
        await fs.rm(lease.directory, { recursive: true, force: true });
    }
};

const tryEntryLease = async (entryDirectory: string) =>
    tryCreateDirectoryLease(path.join(entryDirectory, LEASE_DIRECTORY), true);

const tryCacheLock = async () => {
    await ensureRoot();
    return tryCreateDirectoryLease(
        path.join(configuration.root, CACHE_LOCK),
        false,
    );
};

const acquireCacheLock = async (
    deadline = Date.now() + CACHE_LOCK_WAIT_MS,
): Promise<DirectoryLease | undefined> => {
    const attempt = async (): Promise<DirectoryLease | undefined> => {
        if (Date.now() >= deadline) return undefined;
        const lease = await tryCacheLock();
        if (lease) return lease;
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 25);
        });
        return attempt();
    };
    return attempt();
};

const leaseOwnsEntry = async (lease: DbtGitCacheLease): Promise<boolean> => {
    const value = await readJson(
        path.join(lease.entryDirectory, LEASE_DIRECTORY, LEASE_OWNER),
    );
    return isLeaseOwner(value) && value.leaseId === lease.leaseId;
};

const scheduleTombstoneCleanup = (
    tombstoneDirectory: string,
    lease: DirectoryLease,
) =>
    fs
        .rm(tombstoneDirectory, { recursive: true, force: true })
        .then(() => true)
        .catch(async (error) => {
            await releaseDirectoryLease(lease).catch((releaseError) => {
                warnSwallowedFilesystemError(
                    'Failed to release dbt git cache tombstone lease',
                    releaseError,
                );
            });
            Logger.warn('Failed to remove dbt git cache tombstone', { error });
            return false;
        });

const waitForTombstoneCleanup = (cleanup: Promise<boolean>, deadline: number) =>
    new Promise<boolean>((resolve) => {
        let settled = false;
        const timeout: { timer?: NodeJS.Timeout } = {};
        const finish = (value: boolean) => {
            if (settled) return;
            settled = true;
            if (timeout.timer) clearTimeout(timeout.timer);
            resolve(value);
        };
        timeout.timer = setTimeout(
            () => finish(false),
            Math.max(0, deadline - Date.now()),
        );
        void cleanup.then(finish);
    });

const removeWhileLeased = async (
    lease: DbtGitCacheLease,
): Promise<TombstoneRetirement | undefined> => {
    if (lease.closed) return undefined;
    await stopHeartbeat(lease.heartbeat);
    const active = activeLeases.get(lease.key);
    if (active?.leaseId === lease.leaseId) {
        activeLeases.delete(lease.key);
    }
    const ownsEntry = await leaseOwnsEntry(lease);
    if (ownsEntry && (await isOwnedEntry(lease.key, lease.entryDirectory))) {
        const tombstoneDirectory = path.join(
            configuration.root,
            `.tombstone-${lease.key}-${lease.leaseId}`,
        );
        try {
            await fs.rename(lease.entryDirectory, tombstoneDirectory);
        } catch (error) {
            await releaseDirectoryLease({
                leaseId: lease.leaseId,
                directory: path.join(lease.entryDirectory, LEASE_DIRECTORY),
                heartbeat: lease.heartbeat,
            }).catch((releaseError) => {
                warnSwallowedFilesystemError(
                    'Failed to release dbt git cache entry lease',
                    releaseError,
                );
            });
            Object.assign(lease, { closed: true });
            throw error;
        }
        Object.assign(lease, { closed: true });
        return {
            cleanup: scheduleTombstoneCleanup(tombstoneDirectory, {
                leaseId: lease.leaseId,
                directory: path.join(tombstoneDirectory, LEASE_DIRECTORY),
                heartbeat: lease.heartbeat,
            }),
        };
    }
    if (ownsEntry) {
        await releaseDirectoryLease({
            leaseId: lease.leaseId,
            directory: path.join(lease.entryDirectory, LEASE_DIRECTORY),
            heartbeat: lease.heartbeat,
        });
    }
    Object.assign(lease, { closed: true });
    return undefined;
};

const removeTombstoneWhileLeased = async (
    entry: OwnedEntry,
    lease: DirectoryLease,
): Promise<TombstoneRetirement | undefined> => {
    await stopHeartbeat(lease.heartbeat);
    const owner = await readJson(path.join(lease.directory, LEASE_OWNER));
    if (
        isLeaseOwner(owner) &&
        owner.leaseId === lease.leaseId &&
        (await isOwnedEntry(entry.key, entry.entryDirectory))
    ) {
        return {
            cleanup: scheduleTombstoneCleanup(entry.entryDirectory, lease),
        };
    }
    await releaseDirectoryLease(lease);
    return undefined;
};

const toPublicLease = (
    key: string,
    entryDirectory: string,
    lease: DirectoryLease,
    reused: boolean,
): DbtGitCacheLease => ({
    key,
    entryDirectory,
    checkoutDirectory: path.join(entryDirectory, 'checkout'),
    depsMarkerPath: path.join(entryDirectory, 'deps.json'),
    leaseId: lease.leaseId,
    heartbeat: lease.heartbeat,
    reused,
    invalidated: false,
    closed: false,
});

const markPendingDelete = async (entryDirectory: string) => {
    try {
        await fs.writeFile(path.join(entryDirectory, PENDING_DELETE), '', {
            flag: 'wx',
            mode: 0o600,
        });
    } catch (error) {
        if (
            !['EEXIST', 'ENOENT'].includes(
                (error as NodeJS.ErrnoException).code ?? '',
            )
        ) {
            throw error;
        }
    }
};

const evictEntry = async (entry: OwnedEntry, deferIfLeased: boolean) => {
    if (!entry.owned) return undefined;
    const acquired = await tryEntryLease(entry.entryDirectory);
    if (!acquired) {
        if (deferIfLeased) await markPendingDelete(entry.entryDirectory);
        return undefined;
    }
    if (entry.kind === 'tombstone') {
        return removeTombstoneWhileLeased(entry, acquired);
    }
    return removeWhileLeased(
        toPublicLease(entry.key, entry.entryDirectory, acquired, true),
    );
};

const evictFirstAvailableEntry = async (
    entries: OwnedEntry[],
): Promise<TombstoneRetirement | undefined> => {
    const [entry, ...remaining] = entries;
    if (!entry) return undefined;
    const retirement = await evictEntry(entry, false);
    return retirement ?? evictFirstAvailableEntry(remaining);
};

type AbandonedEntry = {
    entry: OwnedEntry;
    stat: Stats;
};

type ReservedCleanup = {
    path: string;
    lease?: DirectoryLease;
};

const abandonedEntry = async (
    entry: OwnedEntry,
    now: number,
): Promise<AbandonedEntry | undefined> => {
    if (entry.owned && (entry.kind === 'tombstone' || entry.metadata)) {
        return undefined;
    }
    const stat = await fs.lstat(entry.entryDirectory).catch((error) => {
        warnSwallowedFilesystemError(
            'Failed to inspect abandoned dbt git cache entry',
            error,
        );
        return undefined;
    });
    if (
        stat === undefined ||
        !(await isPrivateRootChild(entry.entryDirectory, stat, 'directory'))
    ) {
        return undefined;
    }
    const ageStat = entry.owned
        ? await fs
              .lstat(path.join(entry.entryDirectory, ENTRY_MARKER))
              .catch((error) => {
                  warnSwallowedFilesystemError(
                      'Failed to inspect dbt git cache entry marker',
                      error,
                  );
                  return undefined;
              })
        : stat;
    if (
        ageStat === undefined ||
        now - ageStat.mtimeMs <= ABANDONED_ROOT_GRACE_MS
    ) {
        return undefined;
    }
    const owner = await readJson(
        path.join(entry.entryDirectory, LEASE_DIRECTORY, LEASE_OWNER),
    );
    if (isLeaseOwner(owner) && !(await leaseOwnerIsProvablyStale(owner))) {
        return undefined;
    }
    return { entry, stat };
};

const reserveAbandonedEntryCleanup = async (
    candidate: AbandonedEntry,
): Promise<ReservedCleanup | undefined> => {
    if (
        !(await isPrivateRootChild(
            candidate.entry.entryDirectory,
            candidate.stat,
            'directory',
        ))
    ) {
        return undefined;
    }
    const owned = await isOwnedEntry(
        candidate.entry.key,
        candidate.entry.entryDirectory,
    );
    const metadata = owned
        ? await readJson(path.join(candidate.entry.entryDirectory, METADATA))
        : undefined;
    if (
        owned &&
        (candidate.entry.kind === 'tombstone' || isMetadata(metadata))
    ) {
        return undefined;
    }
    const lease = await tryEntryLease(candidate.entry.entryDirectory);
    if (!lease) {
        const owner = await readJson(
            path.join(
                candidate.entry.entryDirectory,
                LEASE_DIRECTORY,
                LEASE_OWNER,
            ),
        );
        if (isLeaseOwner(owner) && !(await leaseOwnerIsProvablyStale(owner))) {
            return undefined;
        }
    } else {
        await stopHeartbeat(lease.heartbeat);
        const owner = await readJson(path.join(lease.directory, LEASE_OWNER));
        if (!isLeaseOwner(owner) || owner.leaseId !== lease.leaseId) {
            await releaseDirectoryLease(lease);
            return undefined;
        }
    }
    if (
        !(await isPrivateRootChild(
            candidate.entry.entryDirectory,
            candidate.stat,
            'directory',
        ))
    ) {
        if (lease) await releaseDirectoryLease(lease);
        return undefined;
    }
    const tombstonePath = path.join(
        configuration.root,
        `.tombstone-${candidate.entry.key}-${randomUUID()}`,
    );
    try {
        await fs.rename(candidate.entry.entryDirectory, tombstonePath);
    } catch (error) {
        if (lease) {
            await releaseDirectoryLease(lease).catch((releaseError) => {
                warnSwallowedFilesystemError(
                    'Failed to release abandoned dbt git cache entry lease',
                    releaseError,
                );
            });
        }
        throw error;
    }
    return {
        path: tombstonePath,
        lease: lease
            ? {
                  ...lease,
                  directory: path.join(tombstonePath, LEASE_DIRECTORY),
              }
            : undefined,
    };
};

const reserveRootDebrisCleanup = async (
    candidate: RootDebris,
    now: number,
): Promise<ReservedCleanup | undefined> => {
    if (
        now - candidate.stat.mtimeMs <= ABANDONED_ROOT_GRACE_MS ||
        !(await isPrivateRootChild(candidate.path, candidate.stat, 'file'))
    ) {
        return undefined;
    }
    const retiredPath = path.join(
        configuration.root,
        `.retired-${randomUUID()}.tmp`,
    );
    await fs.rename(candidate.path, retiredPath);
    return { path: retiredPath };
};

const cleanupReservedRootCandidate = async (cleanup: ReservedCleanup) => {
    try {
        await fs.rm(cleanup.path, { recursive: true, force: true });
    } catch (error) {
        if (cleanup.lease) {
            await releaseDirectoryLease(cleanup.lease).catch((releaseError) => {
                Logger.warn('Failed to release dbt git cache cleanup lease', {
                    error: releaseError,
                });
            });
        }
        Logger.warn('Failed to remove abandoned dbt git cache object', {
            error,
        });
    }
};

const acquireNewDbtGitProjectCache = async (
    identity: DbtGitCacheIdentity,
    repositoryIdentity: string,
    key: string,
    entryDirectory: string,
    totalDeadline: number,
    attempt: number,
    onMiss: ((reason: string) => void) | undefined,
): Promise<DbtGitCacheLease | undefined> => {
    if (Date.now() >= totalDeadline || attempt >= PUBLICATION_MAX_ATTEMPTS) {
        onMiss?.(
            attempt >= PUBLICATION_MAX_ATTEMPTS
                ? 'entry-cap'
                : 'admission-timeout',
        );
        return undefined;
    }
    const cacheLock = await acquireCacheLock(
        Math.min(totalDeadline, Date.now() + CACHE_LOCK_WAIT_MS),
    );
    if (!cacheLock) {
        onMiss?.('lock-timeout');
        return undefined;
    }
    let cleanup: Promise<boolean> | undefined;
    try {
        const entries = await listOwnedEntries();
        if (entries.length >= DBT_GIT_CACHE_MAX_ENTRIES) {
            const candidates = entries
                .filter(
                    (entry) =>
                        entry.kind === 'entry' &&
                        entry.owned &&
                        entry.metadata?.state === 'retained',
                )
                .sort(
                    (left, right) =>
                        (left.metadata?.lastUsedAt ?? 0) -
                        (right.metadata?.lastUsedAt ?? 0),
                );
            cleanup = (await evictFirstAvailableEntry(candidates))?.cleanup;
            if (!cleanup) {
                onMiss?.('entry-cap');
                return undefined;
            }
        } else {
            try {
                await fs.mkdir(entryDirectory, { mode: 0o700 });
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
                    onMiss?.(
                        (await isOwnedEntry(key, entryDirectory))
                            ? 'busy'
                            : 'corrupt',
                    );
                    return undefined;
                }
                throw error;
            }
            try {
                await atomicWriteJson(path.join(entryDirectory, ENTRY_MARKER), {
                    version: CACHE_VERSION,
                    key,
                });
                await atomicWriteJson(path.join(entryDirectory, METADATA), {
                    version: CACHE_VERSION,
                    key,
                    identity,
                    repositoryIdentity,
                    state: 'active',
                    sizeBytes: 0,
                    lastUsedAt: Date.now(),
                } satisfies EntryMetadata);
                const acquired = await tryEntryLease(entryDirectory);
                if (!acquired) {
                    await fs.rm(entryDirectory, {
                        recursive: true,
                        force: true,
                    });
                    onMiss?.('busy');
                    return undefined;
                }
                const lease = toPublicLease(
                    key,
                    entryDirectory,
                    acquired,
                    false,
                );
                activeLeases.set(key, lease);
                return lease;
            } catch (error) {
                await fs.rm(entryDirectory, { recursive: true, force: true });
                throw error;
            }
        }
    } finally {
        await releaseDirectoryLease(cacheLock);
    }
    if (
        cleanup &&
        (await waitForTombstoneCleanup(
            cleanup,
            Math.min(totalDeadline, Date.now() + TOMBSTONE_CLEANUP_WAIT_MS),
        ))
    ) {
        return acquireNewDbtGitProjectCache(
            identity,
            repositoryIdentity,
            key,
            entryDirectory,
            totalDeadline,
            attempt + 1,
            onMiss,
        );
    }
    onMiss?.('cleanup-timeout');
    return undefined;
};

export const acquireDbtGitProjectCache = async (
    identity: DbtGitCacheIdentity,
    repositoryIdentity: string,
    onMiss?: (reason: string) => void,
): Promise<DbtGitCacheLease | undefined> => {
    if (configuration.maxBytes <= 0) {
        onMiss?.('disabled');
        return undefined;
    }
    await ensureRoot();
    const key = keyFor(identity, repositoryIdentity);
    const entryDirectory = path.join(configuration.root, key);
    const existing = await isOwnedEntry(key, entryDirectory);
    if (existing) {
        const acquired = await tryEntryLease(entryDirectory);
        if (!acquired) {
            onMiss?.('busy');
            return undefined;
        }
        const lease = toPublicLease(key, entryDirectory, acquired, true);
        try {
            const value = await readJson(path.join(entryDirectory, METADATA));
            const pending = await pathExists(
                path.join(entryDirectory, PENDING_DELETE),
            );
            if (
                pending ||
                !isMetadata(value) ||
                value.key !== key ||
                value.repositoryIdentity !== repositoryIdentity ||
                dbtGitCacheIdentityKey(value.identity) !==
                    dbtGitCacheIdentityKey(identity) ||
                value.state !== 'retained' ||
                Date.now() - value.lastUsedAt > configuration.maxAgeMs
            ) {
                await removeWhileLeased(lease);
                return await acquireDbtGitProjectCache(
                    identity,
                    repositoryIdentity,
                    onMiss,
                );
            }
            activeLeases.set(key, lease);
            return lease;
        } catch (error) {
            await removeWhileLeased(lease).catch((cleanupError) => {
                warnSwallowedFilesystemError(
                    'Failed to retire invalid dbt git cache entry',
                    cleanupError,
                );
            });
            throw error;
        }
    }
    return acquireNewDbtGitProjectCache(
        identity,
        repositoryIdentity,
        key,
        entryDirectory,
        Date.now() + RETENTION_TOTAL_WAIT_MS,
        0,
        onMiss,
    );
};

export const invalidateOwnedDbtGitCacheLease = async (
    lease: DbtGitCacheLease,
) => {
    Object.assign(lease, {
        invalidated: true,
        retained: false,
        retentionReason: 'invalidated',
    });
    await removeWhileLeased(lease);
};

const declineDbtGitCacheRetention = async (
    lease: DbtGitCacheLease,
    reason: string,
) => {
    Object.assign(lease, { retained: false, retentionReason: reason });
    Logger.warn('Declined dbt git cache retention', { reason });
    await removeWhileLeased(lease);
};

const retainDbtGitProjectCache = async (
    lease: DbtGitCacheLease,
    sizeBytes: number,
    totalDeadline: number,
    attempt: number,
): Promise<void> => {
    if (Date.now() >= totalDeadline || attempt >= PUBLICATION_MAX_ATTEMPTS) {
        await declineDbtGitCacheRetention(
            lease,
            attempt >= PUBLICATION_MAX_ATTEMPTS
                ? 'publication-attempt-limit'
                : 'publication-deadline',
        );
        return;
    }
    const cacheLock = await acquireCacheLock(
        Math.min(totalDeadline, Date.now() + CACHE_LOCK_WAIT_MS),
    );
    if (!cacheLock) {
        await declineDbtGitCacheRetention(lease, 'reservation-lock-timeout');
        return;
    }
    let cleanup: Promise<boolean> | undefined;
    let declineRetention: string | undefined;
    try {
        const entries = await listOwnedEntries();
        const corrupt = entries.some(
            (entry) =>
                !entry.owned || (entry.kind === 'entry' && !entry.metadata),
        );
        if (corrupt || entries.length > DBT_GIT_CACHE_MAX_ENTRIES) {
            declineRetention = corrupt ? 'corrupt-root-entry' : 'entry-limit';
        } else {
            const others = entries.filter(
                (entry) => entry.entryDirectory !== lease.entryDirectory,
            );
            const entryCapacityBytes = async (entry: OwnedEntry) => {
                if (entry.kind === 'tombstone') return configuration.maxBytes;
                if (!entry.metadata) return configuration.maxBytes;
                if (entry.metadata.state === 'retained') {
                    return entry.metadata.sizeBytes;
                }
                if (activeLeases.has(entry.key)) return 0;
                const owner = await readJson(
                    path.join(
                        entry.entryDirectory,
                        LEASE_DIRECTORY,
                        LEASE_OWNER,
                    ),
                );
                const actualStartTime = isLeaseOwner(owner)
                    ? await processStartTime(owner.pid)
                    : { status: 'unknown' as const };
                if (
                    isLeaseOwner(owner) &&
                    owner.hostname === os.hostname() &&
                    actualStartTime.status === 'found' &&
                    actualStartTime.value === owner.processStartTime
                ) {
                    return 0;
                }
                return configuration.maxBytes;
            };
            const retainedBytes = (
                await Promise.all(others.map(entryCapacityBytes))
            ).reduce((total, entryBytes) => total + entryBytes, 0);
            const retainedCount = others.filter(
                (entry) =>
                    entry.kind === 'tombstone' ||
                    entry.metadata?.state === 'retained',
            ).length;
            if (
                retainedBytes + sizeBytes > configuration.maxBytes ||
                retainedCount + 1 > DBT_GIT_CACHE_MAX_ENTRIES
            ) {
                const candidates = others
                    .filter(
                        (entry) =>
                            entry.kind === 'entry' &&
                            entry.metadata?.state === 'retained',
                    )
                    .sort(
                        (left, right) =>
                            (left.metadata?.lastUsedAt ?? 0) -
                            (right.metadata?.lastUsedAt ?? 0),
                    );
                cleanup = (await evictFirstAvailableEntry(candidates))?.cleanup;
                if (!cleanup) declineRetention = 'capacity-unavailable';
            } else {
                const current = await readJson(
                    path.join(lease.entryDirectory, METADATA),
                );
                const pendingAfterAccounting = await pathExists(
                    path.join(lease.entryDirectory, PENDING_DELETE),
                );
                const ownsLease = await leaseOwnsEntry(lease);
                if (
                    lease.invalidated ||
                    pendingAfterAccounting ||
                    !isMetadata(current) ||
                    current.key !== lease.key ||
                    !ownsLease
                ) {
                    if (lease.invalidated) {
                        declineRetention = 'invalidated';
                    } else if (pendingAfterAccounting) {
                        declineRetention = 'pending-delete';
                    } else if (!ownsLease) {
                        declineRetention = 'lease-lost';
                    } else {
                        declineRetention = 'invalid-metadata';
                    }
                } else {
                    await atomicWriteJson(
                        path.join(lease.entryDirectory, METADATA),
                        {
                            ...current,
                            state: 'retained',
                            sizeBytes,
                            lastUsedAt: Date.now(),
                        } satisfies EntryMetadata,
                    );
                    await releaseDirectoryLease({
                        leaseId: lease.leaseId,
                        directory: path.join(
                            lease.entryDirectory,
                            LEASE_DIRECTORY,
                        ),
                        heartbeat: lease.heartbeat,
                    });
                    if (
                        activeLeases.get(lease.key)?.leaseId === lease.leaseId
                    ) {
                        activeLeases.delete(lease.key);
                    }
                    Object.assign(lease, {
                        closed: true,
                        retained: true,
                        retentionReason: undefined,
                    });
                }
            }
        }
    } finally {
        await releaseDirectoryLease(cacheLock);
    }
    if (declineRetention) {
        await declineDbtGitCacheRetention(lease, declineRetention);
        return;
    }
    if (cleanup) {
        if (
            await waitForTombstoneCleanup(
                cleanup,
                Math.min(totalDeadline, Date.now() + TOMBSTONE_CLEANUP_WAIT_MS),
            )
        ) {
            return retainDbtGitProjectCache(
                lease,
                sizeBytes,
                totalDeadline,
                attempt + 1,
            );
        }
        await declineDbtGitCacheRetention(lease, 'cleanup-timeout');
    }
};

export const releaseDbtGitProjectCache = async (
    lease: DbtGitCacheLease,
    sizeBytes: number,
) => {
    if (lease.closed) return;
    const pending = await pathExists(
        path.join(lease.entryDirectory, PENDING_DELETE),
    );
    if (lease.invalidated || pending || sizeBytes > configuration.maxBytes) {
        let reason = 'entry-too-large';
        if (lease.invalidated) reason = 'invalidated';
        else if (pending) reason = 'pending-delete';
        await declineDbtGitCacheRetention(lease, reason);
        return;
    }
    await retainDbtGitProjectCache(
        lease,
        sizeBytes,
        Date.now() + RETENTION_TOTAL_WAIT_MS,
        0,
    );
};

const invalidateMatchingEntries = async (
    predicate: (identity: DbtGitCacheIdentity) => boolean,
) => {
    const cacheLock = await acquireCacheLock();
    if (!cacheLock) return;
    try {
        const entries = await listOwnedEntries();
        await Promise.all(
            entries.map(async (entry) => {
                if (
                    entry.kind !== 'entry' ||
                    !entry.metadata ||
                    !predicate(entry.metadata.identity)
                ) {
                    return;
                }
                const active = activeLeases.get(entry.key);
                if (active) {
                    active.invalidated = true;
                    await markPendingDelete(entry.entryDirectory);
                    return;
                }
                await evictEntry(entry, true);
            }),
        );
    } finally {
        await releaseDirectoryLease(cacheLock);
    }
};

export const invalidateDbtGitProjectCacheProject = async (
    projectUuid: string,
) =>
    invalidateMatchingEntries(
        (identity) => identity.projectUuid === projectUuid,
    );

export const invalidateDbtGitProjectCacheSource = async (
    projectUuid: string,
    sourceUuid: string,
) =>
    invalidateMatchingEntries(
        (identity) =>
            identity.projectUuid === projectUuid &&
            identity.sourceUuid === sourceUuid,
    );

export async function maintainDbtGitProjectCache() {
    const disabled = configuration.maxBytes <= 0;
    const entries = await listOwnedEntries();
    const rootDebris = await listRootDebris();
    const identities = entries.flatMap((entry) =>
        entry.kind === 'entry' && entry.owned && entry.metadata
            ? [entry.metadata.identity]
            : [],
    );
    const checkedIdentities = new Set(identities.map(dbtGitCacheIdentityKey));
    let live: Set<string> | undefined;
    if (
        !disabled &&
        configuration.livenessCheck &&
        identities.length <= DBT_GIT_CACHE_MAX_ENTRIES
    ) {
        try {
            live = await configuration.livenessCheck(identities);
        } catch {
            live = undefined;
        }
    }
    const now = Date.now();
    const abandoned = await Promise.all(
        entries.map((entry) => abandonedEntry(entry, now)),
    ).then((values) =>
        values.filter((entry): entry is AbandonedEntry => !!entry),
    );
    const candidates = await Promise.all(
        entries.map(async (entry) => {
            if (!entry.owned) return undefined;
            if (entry.kind === 'tombstone') return entry;
            if (!entry.metadata) return undefined;
            if (disabled) return entry;
            const identityKey = dbtGitCacheIdentityKey(entry.metadata.identity);
            return now - entry.metadata.lastUsedAt > configuration.maxAgeMs ||
                (live !== undefined &&
                    checkedIdentities.has(identityKey) &&
                    !live.has(identityKey))
                ? entry
                : undefined;
        }),
    ).then((values) => values.filter((entry): entry is OwnedEntry => !!entry));
    const cacheLock = await acquireCacheLock();
    if (!cacheLock) return;
    const reservedCleanup: ReservedCleanup[] = [];
    try {
        await Promise.all(
            candidates.map(async (entry) => {
                const acquired = await tryEntryLease(entry.entryDirectory);
                if (!acquired) {
                    if (
                        entry.kind === 'entry' &&
                        entry.metadata &&
                        (disabled ||
                            (live !== undefined &&
                                !live.has(
                                    dbtGitCacheIdentityKey(
                                        entry.metadata.identity,
                                    ),
                                )))
                    ) {
                        await markPendingDelete(entry.entryDirectory);
                    }
                    return;
                }
                if (entry.kind === 'tombstone') {
                    await removeTombstoneWhileLeased(entry, acquired);
                    return;
                }
                const lease = toPublicLease(
                    entry.key,
                    entry.entryDirectory,
                    acquired,
                    true,
                );
                const current = await readJson(
                    path.join(entry.entryDirectory, METADATA),
                );
                const pending = await pathExists(
                    path.join(entry.entryDirectory, PENDING_DELETE),
                );
                let shouldDelete = pending || disabled;
                if (isMetadata(current)) {
                    const identityKey = dbtGitCacheIdentityKey(
                        current.identity,
                    );
                    shouldDelete ||=
                        now - current.lastUsedAt > configuration.maxAgeMs ||
                        (live !== undefined &&
                            checkedIdentities.has(identityKey) &&
                            !live.has(identityKey));
                } else {
                    const markerStat = await fs
                        .lstat(path.join(entry.entryDirectory, ENTRY_MARKER))
                        .catch((error) => {
                            warnSwallowedFilesystemError(
                                'Failed to inspect dbt git cache entry marker',
                                error,
                            );
                            return undefined;
                        });
                    shouldDelete ||=
                        markerStat !== undefined &&
                        now - markerStat.mtimeMs > configuration.maxAgeMs;
                }
                if (shouldDelete) {
                    await removeWhileLeased(lease);
                } else {
                    await releaseDirectoryLease(acquired);
                }
            }),
        );
        const [abandonedCleanup, debrisCleanup] = await Promise.all([
            Promise.all(abandoned.map(reserveAbandonedEntryCleanup)),
            Promise.all(
                rootDebris.map((debris) =>
                    reserveRootDebrisCleanup(debris, now),
                ),
            ),
        ]);
        reservedCleanup.push(
            ...abandonedCleanup.filter(
                (cleanup): cleanup is ReservedCleanup => !!cleanup,
            ),
            ...debrisCleanup.filter(
                (cleanup): cleanup is ReservedCleanup => !!cleanup,
            ),
        );
    } finally {
        await releaseDirectoryLease(cacheLock);
    }
    await Promise.all(reservedCleanup.map(cleanupReservedRootCandidate));
}

export const configureDbtGitProjectCache = (args: {
    maxBytes: number;
    maxAgeMs: number;
    livenessCheck: DbtGitCacheLivenessCheck;
    root?: string;
}) => {
    configuration = {
        root: args.root ?? configuration.root,
        maxBytes: Number.isSafeInteger(args.maxBytes)
            ? args.maxBytes
            : DBT_GIT_CACHE_DEFAULT_MAX_BYTES,
        maxAgeMs:
            Number.isSafeInteger(args.maxAgeMs) && args.maxAgeMs > 0
                ? args.maxAgeMs
                : DBT_GIT_CACHE_DEFAULT_MAX_AGE_MS,
        livenessCheck: args.livenessCheck,
    };
    if (!maintenanceTimer) {
        maintenanceTimer = setInterval(() => {
            void maintainDbtGitProjectCache().catch((error) => {
                Logger.warn('Failed to maintain dbt git project cache', {
                    error,
                });
            });
        }, DBT_GIT_CACHE_MAINTENANCE_INTERVAL_MS);
        maintenanceTimer.unref();
    }
};

export const getDbtGitCacheConfigurationForTests = () => ({ ...configuration });
