import { assertUnreachable } from '@lightdash/common';
import {
    type MigrationLease,
    type MigrationLeaseClaimResult,
    type MigrationLeaseIdentity,
    type MigrationLeaseReadResult,
    type MigrationLeaseUnlockResult,
} from '../../database/migrationLease';
import { MigrationHeartbeat, type MigrationHeartbeatClient } from './heartbeat';
import { type KnexMigrationState } from './migrationState';

const DEFAULT_WAIT_TIMEOUT_MS = 30 * 60_000;
const DEFAULT_FOLLOWER_POLL_INTERVAL_MS = 5_000;
const GRAPHILE_MIGRATION_NAME = 'graphile-worker';

type MigrateCommand = 'up' | 'status' | 'wait' | 'unlock';
type MigrationStatusState = 'idle' | 'migrating' | 'stale';

type MigrateCliOptions = {
    command: MigrateCommand;
    json: boolean;
    timeoutMs: number;
    actor: string | null;
    force: boolean;
};

export type MigrationLeaseCommandClient = MigrationHeartbeatClient & {
    claim: (
        identity: MigrationLeaseIdentity,
    ) => Promise<MigrationLeaseClaimResult>;
    setCurrentMigration: (
        token: string,
        currentMigration: string | null,
    ) => Promise<boolean>;
    release: (token: string) => Promise<boolean>;
    unlock: (
        actor: string,
        force: boolean,
    ) => Promise<MigrationLeaseUnlockResult>;
    read: () => Promise<MigrationLeaseReadResult>;
};

export type MigrateCliContext = {
    leaseManager: MigrationLeaseCommandClient;
    heartbeatLeaseManager: MigrationHeartbeatClient;
    identity: MigrationLeaseIdentity;
    getMigrationState: () => Promise<KnexMigrationState>;
    cleanupInvalidIndexes: (pendingMigrationNames: string[]) => Promise<void>;
    migrateOne: (name: string) => Promise<void>;
    isKnexLockHeld: () => Promise<boolean>;
    clearKnexLock: () => Promise<void>;
    runGraphileMigrations: () => Promise<void>;
    log: (line: string) => void;
    logError: (line: string) => void;
    warn: (line: string) => void;
    onLeaseLost: (error: Error) => void;
    sleep: (durationMs: number) => Promise<void>;
    now: () => number;
    defaultTimeoutMs: number;
    followerPollIntervalMs: number;
    heartbeatIntervalMs: number;
    allowMissingMigrations: boolean;
};

type PartialMigrateCliContext = Omit<
    MigrateCliContext,
    | 'log'
    | 'logError'
    | 'warn'
    | 'cleanupInvalidIndexes'
    | 'sleep'
    | 'now'
    | 'defaultTimeoutMs'
    | 'followerPollIntervalMs'
    | 'heartbeatIntervalMs'
    | 'allowMissingMigrations'
> &
    Partial<
        Pick<
            MigrateCliContext,
            | 'log'
            | 'logError'
            | 'warn'
            | 'cleanupInvalidIndexes'
            | 'sleep'
            | 'now'
            | 'defaultTimeoutMs'
            | 'followerPollIntervalMs'
            | 'heartbeatIntervalMs'
            | 'allowMissingMigrations'
        >
    >;

const sleep = async (durationMs: number): Promise<void> => {
    await new Promise<void>((resolve) => {
        setTimeout(resolve, durationMs);
    });
};

export const createMigrateCliContext = (
    context: PartialMigrateCliContext,
): MigrateCliContext => ({
    ...context,
    log: context.log ?? console.log,
    logError: context.logError ?? console.error,
    warn: context.warn ?? console.warn,
    cleanupInvalidIndexes:
        context.cleanupInvalidIndexes ?? (() => Promise.resolve()),
    sleep: context.sleep ?? sleep,
    now: context.now ?? Date.now,
    defaultTimeoutMs: context.defaultTimeoutMs ?? DEFAULT_WAIT_TIMEOUT_MS,
    followerPollIntervalMs:
        context.followerPollIntervalMs ?? DEFAULT_FOLLOWER_POLL_INTERVAL_MS,
    heartbeatIntervalMs: context.heartbeatIntervalMs ?? 10_000,
    allowMissingMigrations: context.allowMissingMigrations ?? false,
});

const assertMigrationStateRunnable = (state: KnexMigrationState): void => {
    if (state.classification !== 'diverged') {
        return;
    }
    throw new Error(
        `Migration ledger diverged from local files; offending database-only migrations: ${state.offending.join(', ')}`,
    );
};

const parsePositiveInteger = (value: string | undefined, flag: string) => {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
        throw new Error(`${flag} must be a positive integer`);
    }
    return parsed;
};

export const parseMigrationWaitTimeoutMs = (
    value: string | undefined,
): number =>
    value === undefined
        ? DEFAULT_WAIT_TIMEOUT_MS
        : parsePositiveInteger(value, 'MIGRATION_WAIT_TIMEOUT_MS');

const isMigrateCommand = (value: string): value is MigrateCommand =>
    value === 'up' ||
    value === 'status' ||
    value === 'wait' ||
    value === 'unlock';

export const parseMigrateCliOptions = (
    argv: string[],
    defaultTimeoutMs: number,
): MigrateCliOptions => {
    const commandArgument = argv[0] ?? 'up';
    if (!isMigrateCommand(commandArgument)) {
        throw new Error(`Unknown migrate command: ${commandArgument}`);
    }
    const options: MigrateCliOptions = {
        command: commandArgument,
        json: false,
        timeoutMs: defaultTimeoutMs,
        actor: null,
        force: false,
    };
    let timeoutWasProvided = false;
    const argumentsAfterCommand = argv.length === 0 ? [] : argv.slice(1);
    for (let index = 0; index < argumentsAfterCommand.length; index += 1) {
        const argument = argumentsAfterCommand[index];
        if (argument === '--json') {
            options.json = true;
        } else if (argument === '--timeout-ms') {
            index += 1;
            timeoutWasProvided = true;
            options.timeoutMs = parsePositiveInteger(
                argumentsAfterCommand[index],
                '--timeout-ms',
            );
        } else if (argument === '--actor') {
            index += 1;
            options.actor = argumentsAfterCommand[index] ?? null;
            if (options.actor === null || options.actor.length === 0) {
                throw new Error('--actor must be a non-empty string');
            }
        } else if (argument === '--force') {
            options.force = true;
        } else {
            throw new Error(`Unknown migrate argument: ${argument}`);
        }
    }
    if (options.json && options.command !== 'status') {
        throw new Error('--json is only valid with status');
    }
    if (
        timeoutWasProvided &&
        options.command !== 'up' &&
        options.command !== 'wait'
    ) {
        throw new Error('--timeout-ms is only valid with up or wait');
    }
    if (options.actor !== null && options.command !== 'unlock') {
        throw new Error('--actor is only valid with unlock');
    }
    if (options.force && options.command !== 'unlock') {
        throw new Error('--force is only valid with unlock');
    }
    if (options.command === 'unlock' && options.actor === null) {
        throw new Error('unlock requires --actor');
    }
    return options;
};

const formatHolder = (lease: MigrationLease | null): string => {
    if (lease === null || lease.claimToken === null) {
        return 'none';
    }
    const pod = lease.holderPodName ?? 'none';
    const heartbeat = lease.lastHeartbeat?.toISOString() ?? 'none';
    const migration = lease.currentMigration ?? 'none';
    return `${lease.holderHostname ?? 'unknown'} pod=${pod} version=${lease.appVersion ?? 'unknown'} current=${migration} heartbeat=${heartbeat} expired=${lease.expired}`;
};

const logFollowerState = (
    context: MigrateCliContext,
    state: KnexMigrationState,
    lease: MigrationLease | null,
): void => {
    context.log(
        `Pending migrations: ${state.pending.length === 0 ? 'none' : state.pending.join(', ')}`,
    );
    context.log(`Migration lease holder: ${formatHolder(lease)}`);
};

const requireTokenMutation = (
    updated: boolean,
    heartbeat: MigrationHeartbeat,
): void => {
    heartbeat.assertHeld();
    if (!updated) {
        throw new Error('Migration lease token no longer owns the lease');
    }
};

const runPendingKnexMigrations = async (
    context: MigrateCliContext,
    token: string,
    heartbeat: MigrationHeartbeat,
    state: KnexMigrationState,
): Promise<void> => {
    assertMigrationStateRunnable(state);
    const nextMigration = state.pending[0];
    if (nextMigration === undefined) {
        return;
    }
    requireTokenMutation(
        await context.leaseManager.setCurrentMigration(token, nextMigration),
        heartbeat,
    );
    context.log(`Running Knex migration: ${nextMigration}`);
    await context.migrateOne(nextMigration);
    heartbeat.assertHeld();
    await runPendingKnexMigrations(
        context,
        token,
        heartbeat,
        await context.getMigrationState(),
    );
};

const runAsHolder = async (
    context: MigrateCliContext,
    token: string,
): Promise<void> => {
    const heartbeat = new MigrationHeartbeat({
        leaseManager: context.heartbeatLeaseManager,
        token,
        intervalMs: context.heartbeatIntervalMs,
        onError: (error) => {
            const message =
                error instanceof Error ? error.message : String(error);
            context.logError(`Migration heartbeat failed: ${message}`);
        },
        onLeaseLost: context.onLeaseLost,
    });
    let succeeded = false;
    try {
        const state = await context.getMigrationState();
        assertMigrationStateRunnable(state);
        heartbeat.start();
        // The Knex lock table deliberately survives because images older than the lease release still use it during rollback windows.
        await context.clearKnexLock();
        heartbeat.assertHeld();
        await context.cleanupInvalidIndexes(state.pending);
        heartbeat.assertHeld();
        await runPendingKnexMigrations(context, token, heartbeat, state);
        requireTokenMutation(
            await context.leaseManager.setCurrentMigration(
                token,
                GRAPHILE_MIGRATION_NAME,
            ),
            heartbeat,
        );
        context.log('Running Graphile Worker migrations');
        await context.runGraphileMigrations();
        heartbeat.assertHeld();
        requireTokenMutation(
            await context.leaseManager.setCurrentMigration(token, null),
            heartbeat,
        );
        await heartbeat.stop();
        heartbeat.assertHeld();
        if (!(await context.leaseManager.release(token))) {
            throw new Error('Migration lease was lost before release');
        }
        succeeded = true;
        context.log('Database migrations completed');
    } finally {
        await heartbeat.stop();
        if (!succeeded) {
            context.logError('Database migrations did not complete');
        }
    }
};

const pendingWorkExists = (
    state: KnexMigrationState,
    lease: MigrationLease | null,
): boolean =>
    state.pending.length > 0 ||
    (lease !== null && lease.currentMigration !== null);

const followMigrations = async (
    context: MigrateCliContext,
    deadline: number,
    promote: boolean,
): Promise<void> => {
    const state = await context.getMigrationState();
    assertMigrationStateRunnable(state);
    const leaseRead = await context.leaseManager.read();
    const { lease } = leaseRead;
    logFollowerState(context, state, lease);
    const hasPendingWork = pendingWorkExists(state, lease);
    const active = lease !== null && lease.claimToken !== null;
    if (!hasPendingWork && (!active || lease?.expired === true)) {
        context.log('Database migrations are complete');
        return;
    }
    const claimable = !active || lease?.expired === true;
    if (promote && hasPendingWork && claimable) {
        const claim = await context.leaseManager.claim(context.identity);
        if (claim.status === 'acquired') {
            context.log('Promoted follower to migration lease holder');
            await runAsHolder(context, claim.token);
            return;
        }
    }
    if (context.now() >= deadline) {
        throw new Error('Timed out waiting for database migrations');
    }
    await context.sleep(context.followerPollIntervalMs);
    await followMigrations(context, deadline, promote);
};

const runUp = async (
    context: MigrateCliContext,
    timeoutMs: number,
): Promise<void> => {
    const state = await context.getMigrationState();
    assertMigrationStateRunnable(state);
    const claim = await context.leaseManager.claim(context.identity);
    if (claim.status === 'acquired') {
        context.log('Acquired migration lease');
        await runAsHolder(context, claim.token);
        return;
    }
    await followMigrations(context, context.now() + timeoutMs, true);
};

const runWait = async (
    context: MigrateCliContext,
    timeoutMs: number,
): Promise<void> => {
    await followMigrations(context, context.now() + timeoutMs, true);
};

const getMigrationStatusState = (
    lease: MigrationLease | null,
): MigrationStatusState => {
    if (lease === null || lease.claimToken === null) {
        return 'idle';
    }
    if (lease.expired) {
        return 'stale';
    }
    return 'migrating';
};

const statusPayload = async (context: MigrateCliContext) => {
    const [knexState, lease] = await Promise.all([
        context.getMigrationState(),
        context.leaseManager.read(),
    ]);
    const state = getMigrationStatusState(lease.lease);
    return { state, lease, knex: knexState };
};

const runStatus = async (
    context: MigrateCliContext,
    json: boolean,
): Promise<void> => {
    const status = await statusPayload(context);
    if (json) {
        context.log(JSON.stringify(status));
        return;
    }
    context.log(`Migration state: ${status.state}`);
    context.log(`Migration lease initialized: ${status.lease.initialized}`);
    context.log(`Migration lease holder: ${formatHolder(status.lease.lease)}`);
    context.log(`Completed Knex migrations: ${status.knex.completed.length}`);
    context.log(
        `Pending Knex migrations: ${status.knex.pending.length === 0 ? 'none' : status.knex.pending.join(', ')}`,
    );
    context.log(`Knex migration classification: ${status.knex.classification}`);
    context.log(
        `Database-only migrations: ${status.knex.missing.length === 0 ? 'none' : status.knex.missing.join(', ')}`,
    );
};

const runUnlock = async (
    context: MigrateCliContext,
    actor: string,
    force: boolean,
): Promise<void> => {
    if (!force && (await context.isKnexLockHeld())) {
        throw new Error(
            'Knex migration lock is still held in knex_migrations_lock; a legacy migrator may still be running — terminate it first, or pass --force to override',
        );
    }
    const result = await context.leaseManager.unlock(actor, force);
    switch (result.status) {
        case 'held': {
            const holder = `${result.lease.holderHostname ?? 'unknown-host'}/${result.lease.holderPodName ?? 'unknown-pod'}`;
            const currentTime = context.now();
            const lastHeartbeat =
                result.lease.lastHeartbeat?.getTime() ?? currentTime;
            const heartbeatAgeSeconds = Math.max(
                0,
                Math.floor((currentTime - lastHeartbeat) / 1_000),
            );
            throw new Error(
                `Lease is actively held by ${holder} (last heartbeat ${heartbeatAgeSeconds}s ago) — terminate the holder first, or pass --force to override`,
            );
        }
        case 'unlocked':
            await context.clearKnexLock();
            context.log(
                force
                    ? `Migration locks cleared by ${actor} at ${result.lease.lastUnlockedAt?.toISOString() ?? 'unknown'} (forced)`
                    : `Migration locks cleared by ${actor} at ${result.lease.lastUnlockedAt?.toISOString() ?? 'unknown'}`,
            );
            return;
        default:
            assertUnreachable(result, 'Unknown migration unlock result');
    }
};

export const runMigrateCli = async (
    argv: string[],
    context: MigrateCliContext,
): Promise<void> => {
    if (context.allowMissingMigrations) {
        context.warn(
            'ALLOW_MISSING_MIGRATIONS is deprecated for the migrate CLI; the version gate now handles database-ahead migrations automatically.',
        );
    }
    const options = parseMigrateCliOptions(argv, context.defaultTimeoutMs);
    switch (options.command) {
        case 'up':
            await runUp(context, options.timeoutMs);
            return;
        case 'status':
            await runStatus(context, options.json);
            return;
        case 'wait':
            await runWait(context, options.timeoutMs);
            return;
        case 'unlock':
            if (options.actor === null) {
                throw new Error('unlock requires --actor');
            }
            await runUnlock(context, options.actor, options.force);
            return;
        default:
            assertUnreachable(options.command, 'Unknown migrate command');
    }
};
