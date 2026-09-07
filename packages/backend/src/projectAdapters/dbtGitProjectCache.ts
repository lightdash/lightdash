import { createHash, randomUUID } from 'crypto';
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
const ROOT_MARKER = '.lightdash-dbt-git-cache.json';
const ENTRY_MARKER = '.lightdash-cache-entry.json';
const METADATA = 'metadata.json';
const LEASE_DIRECTORY = 'lease';
const LEASE_OWNER = 'owner.json';
const PENDING_DELETE = 'pending-delete';
const CACHE_LOCK = '.reservation-lock';
const RECLAIM_CLAIM = '.reclaim.json';
const CACHE_LOCK_WAIT_MS = 5_000;
const PUBLICATION_MAX_ATTEMPTS = DBT_GIT_CACHE_MAX_ENTRIES;

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
    heartbeat?: LeaseHeartbeat;
};

type OwnedEntry = {
    key: string;
    entryDirectory: string;
    kind: 'entry' | 'tombstone';
    owned: boolean;
    metadata?: EntryMetadata;
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

const keyFor = (
    identity: DbtGitCacheIdentity,
    repositoryIdentity: string,
): string =>
    createHash('sha256')
        .update(JSON.stringify({ identity, repositoryIdentity }))
        .digest('hex');

const readJson = async (filePath: string): Promise<unknown> => {
    try {
        return JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch {
        return undefined;
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
        await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
        throw error;
    }
};

const isPrivateOwnedStat = (stat: Awaited<ReturnType<typeof fs.lstat>>) =>
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
    let markerStat: Awaited<ReturnType<typeof fs.lstat>>;
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
    } catch {
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
        return (error as NodeJS.ErrnoException).code === 'ENOENT'
            ? { status: 'missing' }
            : { status: 'unknown' };
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
    if (value.hostname !== os.hostname()) return false;
    if (Date.now() - value.heartbeatAt <= LEASE_STALE_MS) return false;
    const actualStartTime = await processStartTime(value.pid);
    return (
        actualStartTime.status === 'missing' ||
        (actualStartTime.status === 'found' &&
            value.processStartTime !== null &&
            actualStartTime.value !== value.processStartTime)
    );
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
    try {
        await fs.writeFile(
            claimPath,
            JSON.stringify({
                claimId,
                claimant: await newLeaseOwner(claimId),
            }),
            {
                flag: 'wx',
                mode: 0o600,
            },
        );
    } catch {
        return false;
    }
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
    } catch {
        return false;
    } finally {
        const claim = await readJson(claimPath);
        if (
            claim &&
            typeof claim === 'object' &&
            (claim as { claimId?: unknown }).claimId === claimId
        ) {
            await fs.rm(claimPath, { force: true }).catch(() => undefined);
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
                .catch(() => undefined);
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
    await heartbeat.pending.catch(() => undefined);
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
            await releaseDirectoryLease(lease).catch(() => undefined);
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
            }).catch(() => undefined);
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

export const acquireDbtGitProjectCache = async (
    identity: DbtGitCacheIdentity,
    repositoryIdentity: string,
): Promise<DbtGitCacheLease | undefined> => {
    await ensureRoot();
    const key = keyFor(identity, repositoryIdentity);
    const entryDirectory = path.join(configuration.root, key);
    const existing = await isOwnedEntry(key, entryDirectory);
    if (existing) {
        const acquired = await tryEntryLease(entryDirectory);
        if (!acquired) return undefined;
        const lease = toPublicLease(key, entryDirectory, acquired, true);
        try {
            const value = await readJson(path.join(entryDirectory, METADATA));
            const pending = await fs
                .access(path.join(entryDirectory, PENDING_DELETE))
                .then(() => true)
                .catch(() => false);
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
                );
            }
            activeLeases.set(key, lease);
            return lease;
        } catch (error) {
            await removeWhileLeased(lease).catch(() => undefined);
            throw error;
        }
    }
    const cacheLock = await acquireCacheLock();
    if (!cacheLock) return undefined;
    try {
        const entries = await listOwnedEntries();
        if (entries.length >= DBT_GIT_CACHE_MAX_ENTRIES) return undefined;
        try {
            await fs.mkdir(entryDirectory, { mode: 0o700 });
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'EEXIST')
                return undefined;
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
                await fs.rm(entryDirectory, { recursive: true, force: true });
                return undefined;
            }
            const lease = toPublicLease(key, entryDirectory, acquired, false);
            activeLeases.set(key, lease);
            return lease;
        } catch (error) {
            await fs.rm(entryDirectory, { recursive: true, force: true });
            throw error;
        }
    } finally {
        await releaseDirectoryLease(cacheLock);
    }
};

export const invalidateOwnedDbtGitCacheLease = async (
    lease: DbtGitCacheLease,
) => {
    Object.assign(lease, { invalidated: true });
    await removeWhileLeased(lease);
};

const retainDbtGitProjectCache = async (
    lease: DbtGitCacheLease,
    sizeBytes: number,
    deadline: number,
    attempt: number,
): Promise<void> => {
    if (Date.now() >= deadline || attempt >= PUBLICATION_MAX_ATTEMPTS) {
        await removeWhileLeased(lease);
        return;
    }
    const cacheLock = await acquireCacheLock(deadline);
    if (!cacheLock) {
        await removeWhileLeased(lease);
        return;
    }
    let cleanup: Promise<boolean> | undefined;
    let declineRetention = false;
    try {
        const entries = await listOwnedEntries();
        const corrupt = entries.some(
            (entry) =>
                !entry.owned || (entry.kind === 'entry' && !entry.metadata),
        );
        if (corrupt || entries.length > DBT_GIT_CACHE_MAX_ENTRIES) {
            declineRetention = true;
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
                declineRetention = cleanup === undefined;
            } else {
                const current = await readJson(
                    path.join(lease.entryDirectory, METADATA),
                );
                const pendingAfterAccounting = await fs
                    .access(path.join(lease.entryDirectory, PENDING_DELETE))
                    .then(() => true)
                    .catch(() => false);
                if (
                    lease.invalidated ||
                    pendingAfterAccounting ||
                    !isMetadata(current) ||
                    current.key !== lease.key
                ) {
                    declineRetention = true;
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
                    Object.assign(lease, { closed: true });
                }
            }
        }
    } finally {
        await releaseDirectoryLease(cacheLock);
    }
    if (declineRetention) {
        await removeWhileLeased(lease);
        return;
    }
    if (cleanup) {
        if (await waitForTombstoneCleanup(cleanup, deadline)) {
            return retainDbtGitProjectCache(
                lease,
                sizeBytes,
                deadline,
                attempt + 1,
            );
        }
        await removeWhileLeased(lease);
    }
};

export const releaseDbtGitProjectCache = async (
    lease: DbtGitCacheLease,
    sizeBytes: number,
) => {
    if (lease.closed) return;
    const pending = await fs
        .access(path.join(lease.entryDirectory, PENDING_DELETE))
        .then(() => true)
        .catch(() => false);
    if (lease.invalidated || pending || sizeBytes > configuration.maxBytes) {
        await removeWhileLeased(lease);
        return;
    }
    await retainDbtGitProjectCache(
        lease,
        sizeBytes,
        Date.now() + CACHE_LOCK_WAIT_MS,
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
    const entries = await listOwnedEntries();
    const identities = entries.flatMap((entry) =>
        entry.kind === 'entry' && entry.owned && entry.metadata
            ? [entry.metadata.identity]
            : [],
    );
    const checkedIdentities = new Set(identities.map(dbtGitCacheIdentityKey));
    let live: Set<string> | undefined;
    if (
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
    const candidates = await Promise.all(
        entries.map(async (entry) => {
            if (!entry.owned) return undefined;
            if (entry.kind === 'tombstone') return entry;
            if (entry.metadata) {
                const identityKey = dbtGitCacheIdentityKey(
                    entry.metadata.identity,
                );
                return now - entry.metadata.lastUsedAt >
                    configuration.maxAgeMs ||
                    (live !== undefined &&
                        checkedIdentities.has(identityKey) &&
                        !live.has(identityKey))
                    ? entry
                    : undefined;
            }
            const markerStat = await fs
                .lstat(path.join(entry.entryDirectory, ENTRY_MARKER))
                .catch(() => undefined);
            return markerStat &&
                now - markerStat.mtimeMs > configuration.maxAgeMs
                ? entry
                : undefined;
        }),
    ).then((values) => values.filter((entry): entry is OwnedEntry => !!entry));
    const cacheLock = await acquireCacheLock();
    if (!cacheLock) return;
    try {
        await Promise.all(
            candidates.map(async (entry) => {
                const acquired = await tryEntryLease(entry.entryDirectory);
                if (!acquired) {
                    if (
                        entry.kind === 'entry' &&
                        entry.metadata &&
                        live !== undefined &&
                        !live.has(
                            dbtGitCacheIdentityKey(entry.metadata.identity),
                        )
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
                const pending = await fs
                    .access(path.join(entry.entryDirectory, PENDING_DELETE))
                    .then(() => true)
                    .catch(() => false);
                let shouldDelete = pending;
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
                        .catch(() => undefined);
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
    } finally {
        await releaseDirectoryLease(cacheLock);
    }
}

export const configureDbtGitProjectCache = (args: {
    maxBytes: number;
    maxAgeMs: number;
    livenessCheck: DbtGitCacheLivenessCheck;
    root?: string;
}) => {
    configuration = {
        root: args.root ?? configuration.root,
        maxBytes:
            Number.isSafeInteger(args.maxBytes) && args.maxBytes > 0
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
