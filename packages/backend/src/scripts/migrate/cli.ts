import { assertUnreachable } from '@lightdash/common';
import {
    type MigrationLease,
    type MigrationLeaseClaimResult,
    type MigrationLeaseIdentity,
    type MigrationLeaseReadResult,
    type MigrationLeaseUnlockResult,
    type MigrationRunHistoryReadResult,
    type MigrationRunStart,
} from '../../database/migrationLease';
import { MigrationHeartbeat, type MigrationHeartbeatClient } from './heartbeat';
import { type KnexMigrationState } from './migrationState';
import {
    renderPreflightReport,
    type PreflightReport,
    type PreflightRunOptions,
} from './preflight';

const DEFAULT_WAIT_TIMEOUT_MS = 30 * 60_000;
const DEFAULT_FOLLOWER_POLL_INTERVAL_MS = 5_000;
const DEFAULT_MIGRATION_MAX_ATTEMPTS = 3;
const DEFAULT_MIGRATION_RETRY_DELAY_MS = 1_000;
const GRAPHILE_MIGRATION_NAME = 'graphile-worker';
const MIGRATION_NAME_PREVIEW_LIMIT = 5;
const MIGRATE_CLI_HELP = `Usage:
  migrate [up] [--timeout-ms <milliseconds>] [--strict] [--force]
  migrate preflight [--strict] [--force] [--json]
  migrate status [--json]
  migrate wait [--timeout-ms <milliseconds>]
  migrate unlock --actor <identity> [--force]

Commands:
  up       Run pending Knex and Graphile Worker migrations (default)
  preflight Check migration safety without changing the database
  status   Show migration lease and Knex migration status
  wait     Wait for migrations and take over an expired lease
  unlock   Clear migration locks for recovery

Flags:
  --timeout-ms <milliseconds>  Set the up or wait timeout
  --json                       Emit the status or preflight payload as JSON
  --strict                     Promote preflight warnings to blockers
  --actor <identity>           Attribute an unlock operation
  --force                      Override blocking preflight checks, an active lease, or a legacy Knex lock
  -h, --help                   Show this help`;

type MigrateCommand = 'up' | 'preflight' | 'status' | 'wait' | 'unlock';
type MigrationStatusState = 'idle' | 'migrating' | 'parked' | 'stale';

type MigrateCliOptions = {
    command: MigrateCommand;
    help: boolean;
    json: boolean;
    timeoutMs: number;
    actor: string | null;
    force: boolean;
    strict: boolean;
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
    startRun: (run: MigrationRunStart) => Promise<string>;
    recordRetry: (
        token: string,
        runUuid: string,
        failingMigration: string,
        failureDetail: string,
    ) => Promise<boolean>;
    completeRun: (token: string, runUuid: string) => Promise<boolean>;
    parkRun: (
        token: string,
        runUuid: string,
        appVersion: string,
        failingMigration: string,
        failureDetail: string,
    ) => Promise<boolean>;
    readRunHistory: (limit?: number) => Promise<MigrationRunHistoryReadResult>;
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
    runPreflight: (options: PreflightRunOptions) => Promise<PreflightReport>;
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
    migrationMaxAttempts: number;
    migrationRetryDelayMs: number;
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
    | 'migrationMaxAttempts'
    | 'migrationRetryDelayMs'
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
            | 'migrationMaxAttempts'
            | 'migrationRetryDelayMs'
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
    migrationMaxAttempts:
        context.migrationMaxAttempts ?? DEFAULT_MIGRATION_MAX_ATTEMPTS,
    migrationRetryDelayMs:
        context.migrationRetryDelayMs ?? DEFAULT_MIGRATION_RETRY_DELAY_MS,
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
    value === 'preflight' ||
    value === 'status' ||
    value === 'wait' ||
    value === 'unlock';

export const parseMigrateCliOptions = (
    argv: string[],
    defaultTimeoutMs: number,
): MigrateCliOptions => {
    const firstArgument = argv[0];
    const topLevelHelp = firstArgument === '--help' || firstArgument === '-h';
    const commandArgument = topLevelHelp ? 'up' : (firstArgument ?? 'up');
    if (!isMigrateCommand(commandArgument)) {
        throw new Error(`Unknown migrate command: ${commandArgument}`);
    }
    const options: MigrateCliOptions = {
        command: commandArgument,
        help: topLevelHelp,
        json: false,
        timeoutMs: defaultTimeoutMs,
        actor: null,
        force: false,
        strict: false,
    };
    let timeoutWasProvided = false;
    const argumentsAfterCommand = argv.slice(1);
    for (let index = 0; index < argumentsAfterCommand.length; index += 1) {
        const argument = argumentsAfterCommand[index];
        if (argument === '--help' || argument === '-h') {
            options.help = true;
        } else if (argument === '--json') {
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
        } else if (argument === '--strict') {
            options.strict = true;
        } else {
            throw new Error(`Unknown migrate argument: ${argument}`);
        }
    }
    if (options.help) {
        return options;
    }
    if (
        options.json &&
        options.command !== 'status' &&
        options.command !== 'preflight'
    ) {
        throw new Error('--json is only valid with status or preflight');
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
    if (
        options.force &&
        options.command !== 'up' &&
        options.command !== 'preflight' &&
        options.command !== 'unlock'
    ) {
        throw new Error('--force is only valid with up, preflight, or unlock');
    }
    if (
        options.strict &&
        options.command !== 'up' &&
        options.command !== 'preflight'
    ) {
        throw new Error('--strict is only valid with up or preflight');
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

const formatMigrationNames = (names: string[]): string => {
    if (names.length === 0) {
        return '0';
    }
    const preview = names.slice(0, MIGRATION_NAME_PREVIEW_LIMIT).join(', ');
    const remaining = names.length - MIGRATION_NAME_PREVIEW_LIMIT;
    return remaining > 0
        ? `${names.length} (${preview}, … and ${remaining} more)`
        : `${names.length} (${preview})`;
};

const logFollowerState = (
    context: MigrateCliContext,
    state: KnexMigrationState,
    lease: MigrationLease | null,
): void => {
    context.log(`Pending migrations: ${formatMigrationNames(state.pending)}`);
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
    setFailingMigration: (migration: string) => void,
): Promise<void> => {
    assertMigrationStateRunnable(state);
    const nextMigration = state.pending[0];
    if (nextMigration === undefined) {
        return;
    }
    setFailingMigration(nextMigration);
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
        setFailingMigration,
    );
};

const getErrorDetail = (error: unknown): string => {
    if (!(error instanceof Error)) {
        return String(error);
    }
    return error.stack ?? error.message;
};

const getErrorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

type AcquiredMigrationLeaseClaim = Extract<
    MigrationLeaseClaimResult,
    { status: 'acquired' }
>;

type MigrationAttemptResult =
    | {
          status: 'succeeded';
          runUuid: string;
      }
    | {
          status: 'failed';
          runUuid: string;
          failingMigration: string;
          failureDetail: string;
          failureMessage: string;
      };

const runHolderAttempt = async (
    context: MigrateCliContext,
    claim: AcquiredMigrationLeaseClaim,
    heartbeat: MigrationHeartbeat,
    attempt: number,
): Promise<MigrationAttemptResult> => {
    const state = await context.getMigrationState();
    const fromMigration = state.completed[state.completed.length - 1] ?? null;
    const toMigration =
        state.pending[state.pending.length - 1] ?? fromMigration;
    const runUuid = await context.leaseManager.startRun({
        token: claim.token,
        identity: context.identity,
        fromMigration,
        toMigration,
        attempt,
        lastUnlockedBy: claim.lease.lastUnlockedBy,
        lastUnlockedAt: claim.lease.lastUnlockedAt,
        lastUnlockForced: claim.lease.lastUnlockForced,
    });
    let failingMigration = 'migration-state';
    try {
        assertMigrationStateRunnable(state);
        failingMigration = 'knex-lock-recovery';
        await context.clearKnexLock();
        heartbeat.assertHeld();
        failingMigration = 'invalid-index-cleanup';
        await context.cleanupInvalidIndexes(state.pending);
        heartbeat.assertHeld();
        await runPendingKnexMigrations(
            context,
            claim.token,
            heartbeat,
            state,
            (migration) => {
                failingMigration = migration;
            },
        );
        failingMigration = GRAPHILE_MIGRATION_NAME;
        requireTokenMutation(
            await context.leaseManager.setCurrentMigration(
                claim.token,
                GRAPHILE_MIGRATION_NAME,
            ),
            heartbeat,
        );
        context.log('Running Graphile Worker migrations');
        await context.runGraphileMigrations();
        heartbeat.assertHeld();
        requireTokenMutation(
            await context.leaseManager.setCurrentMigration(claim.token, null),
            heartbeat,
        );
        return { status: 'succeeded', runUuid };
    } catch (error) {
        return {
            status: 'failed',
            runUuid,
            failingMigration,
            failureDetail: getErrorDetail(error),
            failureMessage: getErrorMessage(error),
        };
    }
};

const runHolderAttempts = async (
    context: MigrateCliContext,
    claim: AcquiredMigrationLeaseClaim,
    heartbeat: MigrationHeartbeat,
    attempt: number,
): Promise<string> => {
    const result = await runHolderAttempt(context, claim, heartbeat, attempt);
    if (result.status === 'succeeded') {
        return result.runUuid;
    }
    if (attempt < context.migrationMaxAttempts) {
        requireTokenMutation(
            await context.leaseManager.recordRetry(
                claim.token,
                result.runUuid,
                result.failingMigration,
                result.failureDetail,
            ),
            heartbeat,
        );
        const retryDelay = context.migrationRetryDelayMs * 2 ** (attempt - 1);
        context.logError(
            `Migration attempt ${attempt}/${context.migrationMaxAttempts} failed at ${result.failingMigration}: ${result.failureMessage}; retrying in ${retryDelay}ms`,
        );
        await context.sleep(retryDelay);
        heartbeat.assertHeld();
        return runHolderAttempts(context, claim, heartbeat, attempt + 1);
    }
    await heartbeat.stop();
    heartbeat.assertHeld();
    if (
        !(await context.leaseManager.parkRun(
            claim.token,
            result.runUuid,
            context.identity.appVersion,
            result.failingMigration,
            result.failureDetail,
        ))
    ) {
        throw new Error('Migration lease was lost before parking');
    }
    throw new Error(
        `Migration parked after ${context.migrationMaxAttempts} attempts at ${result.failingMigration}: ${result.failureMessage}`,
    );
};

const runAsHolder = async (
    context: MigrateCliContext,
    claim: AcquiredMigrationLeaseClaim,
): Promise<void> => {
    const heartbeat = new MigrationHeartbeat({
        leaseManager: context.heartbeatLeaseManager,
        token: claim.token,
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
        heartbeat.start();
        const runUuid = await runHolderAttempts(context, claim, heartbeat, 1);
        await heartbeat.stop();
        heartbeat.assertHeld();
        if (!(await context.leaseManager.completeRun(claim.token, runUuid))) {
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

const assertNotParkedForCurrentVersion = (
    context: MigrateCliContext,
    lease: MigrationLease | null,
): void => {
    if (
        lease?.parkedAt === null ||
        lease?.parkedAppVersion !== context.identity.appVersion
    ) {
        return;
    }
    throw new Error(
        `Migration is parked for app version ${context.identity.appVersion} at ${lease.parkedMigration ?? 'unknown'}: ${lease.parkedError ?? 'unknown error'}; deploy a fixed version or run migrate unlock with operator attribution before retrying this version`,
    );
};

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
    assertNotParkedForCurrentVersion(context, lease);
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
            await runAsHolder(context, claim);
            return;
        }
    }
    if (context.now() >= deadline) {
        throw new Error('Timed out waiting for database migrations');
    }
    await context.sleep(context.followerPollIntervalMs);
    await followMigrations(context, deadline, promote);
};

const runPreflightGate = async (
    context: MigrateCliContext,
    options: PreflightRunOptions,
    json: boolean,
): Promise<void> => {
    const report = await context.runPreflight(options);
    context.log(json ? JSON.stringify(report) : renderPreflightReport(report));
    if (report.decision === 'force-proceed') {
        context.warn(
            '!!! MIGRATION PREFLIGHT OVERRIDE ACTIVE: proceeding despite blocking checks because --force was supplied !!!',
        );
    }
    if (report.decision === 'abort') {
        throw new Error(
            'Migration preflight aborted; resolve the blocking checks or pass --force to override',
        );
    }
};

const runUp = async (
    context: MigrateCliContext,
    timeoutMs: number,
    preflightOptions: PreflightRunOptions,
): Promise<void> => {
    await runPreflightGate(context, preflightOptions, false);
    const state = await context.getMigrationState();
    assertMigrationStateRunnable(state);
    const claim = await context.leaseManager.claim(context.identity);
    if (claim.status === 'acquired') {
        context.log('Acquired migration lease');
        await runAsHolder(context, claim);
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
    if (lease === null) {
        return 'idle';
    }
    if (lease.claimToken !== null && lease.expired) {
        return 'stale';
    }
    if (lease.claimToken !== null) {
        return 'migrating';
    }
    if (lease.parkedAt !== null) {
        return 'parked';
    }
    return 'idle';
};

const formatParkedState = (lease: MigrationLease | null): string => {
    if (lease?.parkedAt === null || lease === null) {
        return 'none';
    }
    return `version=${lease.parkedAppVersion ?? 'unknown'} migration=${lease.parkedMigration ?? 'unknown'} at=${lease.parkedAt.toISOString()} run=${lease.parkedRunUuid ?? 'unknown'} error=${lease.parkedError ?? 'unknown'}`;
};

const formatMigrationRun = (
    run: MigrationRunHistoryReadResult['runs'][number],
): string => {
    const holder = `${run.holderHostname}/${run.holderPodName ?? 'none'}`;
    const finished = run.finishedAt?.toISOString() ?? 'running';
    const failure =
        run.failureDetail === null
            ? 'none'
            : `${run.failingMigration ?? 'unknown'}: ${run.failureDetail}`;
    const unlock =
        run.lastUnlockedBy === null
            ? 'none'
            : `${run.lastUnlockedBy} at ${run.lastUnlockedAt?.toISOString() ?? 'unknown'} forced=${run.lastUnlockForced}`;
    return `Migration run ${run.runUuid}: outcome=${run.outcome} attempt=${run.attempt} holder=${holder} app=${run.appVersion} from=${run.fromMigration ?? 'none'} to=${run.toMigration ?? 'none'} started=${run.startedAt.toISOString()} finished=${finished} failure=${failure} preceding_unlock=${unlock}`;
};

const statusPayload = async (context: MigrateCliContext) => {
    const [knexState, lease, runHistory] = await Promise.all([
        context.getMigrationState(),
        context.leaseManager.read(),
        context.leaseManager.readRunHistory(),
    ]);
    const state = getMigrationStatusState(lease.lease);
    return { state, lease, knex: knexState, runHistory };
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
    context.log(`Parked migration: ${formatParkedState(status.lease.lease)}`);
    context.log(`Completed Knex migrations: ${status.knex.completed.length}`);
    context.log(
        `Pending Knex migrations: ${formatMigrationNames(status.knex.pending)}`,
    );
    context.log(`Knex migration classification: ${status.knex.classification}`);
    context.log(
        `Database-only migrations: ${status.knex.missing.length === 0 ? 'none' : status.knex.missing.join(', ')}`,
    );
    context.log(
        `Migration run history initialized: ${status.runHistory.initialized}`,
    );
    status.runHistory.runs.forEach((run) => {
        context.log(formatMigrationRun(run));
    });
};

const runUnlock = async (
    context: MigrateCliContext,
    actor: string,
    force: boolean,
): Promise<void> => {
    if (!force) {
        const { lease } = await context.leaseManager.read();
        const leaseHasClaimToken = lease !== null && lease.claimToken !== null;
        if (!leaseHasClaimToken && (await context.isKnexLockHeld())) {
            throw new Error(
                'Knex migration lock is still held in knex_migrations_lock; a legacy migrator may still be running — terminate it first, or pass --force to override',
            );
        }
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
    const options = parseMigrateCliOptions(argv, context.defaultTimeoutMs);
    if (options.help) {
        context.log(MIGRATE_CLI_HELP);
        return;
    }
    if (context.allowMissingMigrations) {
        context.warn(
            'ALLOW_MISSING_MIGRATIONS is deprecated for the migrate CLI; the version gate now handles database-ahead migrations automatically.',
        );
    }
    switch (options.command) {
        case 'up':
            await runUp(context, options.timeoutMs, {
                force: options.force,
                strict: options.strict,
            });
            return;
        case 'preflight':
            await runPreflightGate(
                context,
                { force: options.force, strict: options.strict },
                options.json,
            );
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
