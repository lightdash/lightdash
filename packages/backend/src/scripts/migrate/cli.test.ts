import { type UpgradeTelemetryEvent } from '../../analytics/upgradeTelemetryEvents';
import {
    type MigrationLease,
    type MigrationLeaseClaimResult,
    type MigrationLeaseReadResult,
    type MigrationRun,
} from '../../database/migrationLease';
import {
    createMigrateCliContext,
    parseMigrateCliOptions,
    parseMigrationWaitTimeoutMs,
    runMigrateCli,
    type MigrateCliContext,
    type MigrationLeaseCommandClient,
} from './cli';
import { MigrationLeaseLostError } from './heartbeat';
import { type KnexMigrationState } from './migrationState';
import { type PreflightReport } from './preflight';

const migrationClassification = (
    pending: string[],
    missing: string[],
    offending: string[],
): KnexMigrationState['classification'] => {
    if (offending.length > 0) {
        return 'diverged';
    }
    if (missing.length > 0) {
        return 'database-ahead';
    }
    if (pending.length > 0) {
        return 'database-behind';
    }
    return 'up-to-date';
};

const migrationState = (
    pending: string[] = [],
    missing: string[] = [],
    offending: string[] = [],
): KnexMigrationState => ({
    completed: [],
    pending,
    missing,
    offending,
    classification: migrationClassification(pending, missing, offending),
});

const heldLease = (
    overrides: Partial<MigrationLease> = {},
): MigrationLease => ({
    key: 'global',
    holderHostname: 'host-a',
    holderPodName: 'pod-a',
    appVersion: '1.2.3',
    claimToken: 'claim-a',
    startedAt: new Date('2026-08-10T10:00:00.000Z'),
    currentMigration: '001_first.ts',
    lastHeartbeat: new Date('2026-08-10T10:00:10.000Z'),
    lastUnlockedBy: null,
    lastUnlockedAt: null,
    lastUnlockForced: false,
    parkedAt: null,
    parkedAppVersion: null,
    parkedMigration: null,
    parkedError: null,
    parkedRunUuid: null,
    expired: false,
    ...overrides,
});

const readLease = (lease: MigrationLease | null): MigrationLeaseReadResult => ({
    initialized: true,
    lease,
});

const acquired = (token = 'claim-a'): MigrationLeaseClaimResult => ({
    status: 'acquired',
    token,
    lease: heldLease({ claimToken: token }),
});

const migrationRun = (overrides: Partial<MigrationRun> = {}): MigrationRun => ({
    runUuid: 'run-1',
    claimToken: 'claim-a',
    holderHostname: 'host-b',
    holderPodName: 'pod-b',
    appVersion: '1.2.3',
    fromMigration: '000_previous.ts',
    toMigration: '001_first.ts',
    attempt: 1,
    startedAt: new Date('2026-08-10T10:00:00.000Z'),
    finishedAt: new Date('2026-08-10T10:00:05.000Z'),
    outcome: 'succeeded',
    failingMigration: null,
    failureDetail: null,
    lastUnlockedBy: null,
    lastUnlockedAt: null,
    lastUnlockForced: false,
    ...overrides,
});

const preflightReport = (
    overrides: Partial<PreflightReport> = {},
): PreflightReport => ({
    schemaVersion: '1',
    decision: 'proceed',
    force: false,
    strict: false,
    summary: { red: 0, yellow: 0, info: 1 },
    checks: [],
    ...overrides,
});

const leaseManager = (): MigrationLeaseCommandClient => {
    let runNumber = 0;
    return {
        claim: vi.fn(async () => acquired()),
        heartbeat: vi.fn(async () => true),
        setCurrentMigration: vi.fn(async () => true),
        release: vi.fn(async () => true),
        startRun: vi.fn(async () => {
            runNumber += 1;
            return `run-${runNumber}`;
        }),
        recordRetry: vi.fn(async () => true),
        completeRun: vi.fn(async () => true),
        parkRun: vi.fn(async () => true),
        readRunHistory: vi.fn<MigrationLeaseCommandClient['readRunHistory']>(
            async () => ({
                initialized: true,
                runs: [],
            }),
        ),
        readLastSucceededRun: vi.fn(async () => null),
        unlock: vi.fn<MigrationLeaseCommandClient['unlock']>(
            async (actor, force) => ({
                status: 'unlocked',
                lease: heldLease({
                    claimToken: null,
                    holderHostname: null,
                    holderPodName: null,
                    appVersion: null,
                    startedAt: null,
                    currentMigration: null,
                    lastHeartbeat: null,
                    lastUnlockedBy: actor,
                    lastUnlockedAt: new Date('2026-08-10T10:05:00.000Z'),
                    lastUnlockForced: force,
                }),
            }),
        ),
        read: vi.fn(async () => readLease(null)),
    };
};

const context = (
    manager: MigrationLeaseCommandClient,
    overrides: Partial<MigrateCliContext> = {},
) => {
    const lines: string[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];
    const upgradeEvents: UpgradeTelemetryEvent[] = [];
    return {
        lines,
        errors,
        warnings,
        upgradeEvents,
        value: createMigrateCliContext({
            leaseManager: manager,
            heartbeatLeaseManager: {
                heartbeat: vi.fn(async () => true),
            },
            identity: {
                hostname: 'host-b',
                podName: 'pod-b',
                appVersion: '1.2.3',
            },
            getMigrationState: vi.fn(async () => migrationState()),
            runPreflight: vi.fn(async () => preflightReport()),
            migrateOne: vi.fn(async () => {}),
            isKnexLockHeld: vi.fn(async () => false),
            clearKnexLock: vi.fn(async () => {}),
            runGraphileMigrations: vi.fn(async () => {}),
            log: (line) => lines.push(line),
            logError: (line) => errors.push(line),
            warn: (line) => warnings.push(line),
            emitUpgradeEvent: (event) => upgradeEvents.push(event),
            onLeaseLost: vi.fn(),
            sleep: vi.fn(async () => {}),
            heartbeatIntervalMs: 60_000,
            migrationRetryDelayMs: 1,
            ...overrides,
        }),
    };
};

const upgradePropertyKeys = [
    'attempt',
    'duration_seconds',
    'execution_mode',
    'failing_migration',
    'failure_class',
    'from_version',
    'migration_run_uuid',
    'outcome',
    'preceded_by_unlock',
    'preceding_unlock_forced',
    'preflight_blocked_checks',
    'preflight_decision',
    'preflight_red',
    'preflight_yellow',
    'span_migrations',
    'to_version',
];

describe('runMigrateCli', () => {
    test('emits a complete started and completed lifecycle for a successful upgrade', async () => {
        const manager = leaseManager();
        vi.mocked(manager.readLastSucceededRun).mockResolvedValue(
            migrationRun({ appVersion: '1.1.0' }),
        );
        const states = [
            migrationState(['001_first.ts']),
            migrationState(['001_first.ts']),
            migrationState(),
        ];
        const now = vi.fn().mockReturnValueOnce(1_000).mockReturnValue(6_000);
        const command = context(manager, {
            getMigrationState: vi.fn(
                async () => states.shift() ?? migrationState(),
            ),
            now,
        });

        await runMigrateCli(['up'], command.value);

        expect(manager.readLastSucceededRun).toHaveBeenCalledOnce();
        expect(command.upgradeEvents.map(({ event }) => event)).toEqual([
            'upgrade_started',
            'upgrade_completed',
        ]);
        expect(command.upgradeEvents[0]?.properties).toMatchObject({
            migration_run_uuid: 'run-1',
            from_version: '1.1.0',
            to_version: '1.2.3',
            span_migrations: 1,
            attempt: 1,
            duration_seconds: null,
            outcome: null,
        });
        expect(command.upgradeEvents[1]?.properties).toMatchObject({
            migration_run_uuid: 'run-1',
            from_version: '1.1.0',
            span_migrations: 1,
            attempt: 1,
            duration_seconds: 5,
            outcome: 'succeeded',
        });
        command.upgradeEvents.forEach(({ properties }) => {
            expect(Object.keys(properties).sort()).toEqual(upgradePropertyKeys);
        });
    });

    test('emits retry and success lifecycles against each attempt run uuid', async () => {
        const manager = leaseManager();
        const states = [
            migrationState(['001_first.ts']),
            migrationState(['001_first.ts']),
            migrationState(['001_first.ts']),
            migrationState(),
        ];
        const command = context(manager, {
            getMigrationState: vi.fn(
                async () => states.shift() ?? migrationState(),
            ),
            migrateOne: vi
                .fn<MigrateCliContext['migrateOne']>()
                .mockRejectedValueOnce(new Error('retry once'))
                .mockResolvedValue(undefined),
            now: vi
                .fn()
                .mockReturnValueOnce(1_000)
                .mockReturnValueOnce(3_000)
                .mockReturnValueOnce(4_000)
                .mockReturnValue(7_000),
        });

        await runMigrateCli(['up'], command.value);

        expect(
            command.upgradeEvents.map(({ event, properties }) => ({
                event,
                runUuid: properties.migration_run_uuid,
                attempt: properties.attempt,
                outcome: properties.outcome,
            })),
        ).toEqual([
            {
                event: 'upgrade_started',
                runUuid: 'run-1',
                attempt: 1,
                outcome: null,
            },
            {
                event: 'upgrade_failed',
                runUuid: 'run-1',
                attempt: 1,
                outcome: 'retrying',
            },
            {
                event: 'upgrade_started',
                runUuid: 'run-2',
                attempt: 2,
                outcome: null,
            },
            {
                event: 'upgrade_completed',
                runUuid: 'run-2',
                attempt: 2,
                outcome: 'succeeded',
            },
        ]);
    });

    test('preflight runs as a standalone read-only command', async () => {
        const manager = leaseManager();
        const command = context(manager);

        await runMigrateCli(['preflight'], command.value);

        expect(command.value.runPreflight).toHaveBeenCalledWith({
            force: false,
            strict: false,
        });
        expect(manager.claim).not.toHaveBeenCalled();
        expect(command.lines).toContain(
            'Preflight decision: proceed (0 red, 0 yellow)',
        );
    });

    test('preflight --json emits one stable payload line', async () => {
        const manager = leaseManager();
        const command = context(manager);

        await runMigrateCli(['preflight', '--json'], command.value);

        expect(command.lines).toEqual([JSON.stringify(preflightReport())]);
        expect(manager.claim).not.toHaveBeenCalled();
    });

    test('up aborts on red preflight before claiming the migration lease', async () => {
        const manager = leaseManager();
        const command = context(manager, {
            runPreflight: vi.fn(async () =>
                preflightReport({
                    decision: 'abort',
                    summary: { red: 1, yellow: 0, info: 1 },
                }),
            ),
        });

        await expect(runMigrateCli(['up'], command.value)).rejects.toThrow(
            'Migration preflight aborted; resolve the blocking checks or pass --force to override',
        );

        expect(command.value.runPreflight).toHaveBeenCalledOnce();
        expect(manager.claim).not.toHaveBeenCalled();
        expect(command.value.getMigrationState).not.toHaveBeenCalled();
    });

    test('preflight abort emits only the blocked checks and pending span', async () => {
        const manager = leaseManager();
        const command = context(manager, {
            runPreflight: vi.fn(async () =>
                preflightReport({
                    decision: 'abort',
                    summary: { red: 1, yellow: 0, info: 1 },
                    checks: [
                        {
                            id: 'postgres-version',
                            severity: 'red',
                            outcome: 'fail',
                            message: 'unsupported',
                            data: {
                                serverVersion: '11.0',
                                serverVersionNum: 110000,
                                minimumSupportedMajor: 12,
                                probeError: null,
                            },
                        },
                        {
                            id: 'pending-migrations',
                            severity: 'info',
                            outcome: 'info',
                            message: '2 pending migration(s)',
                            data: {
                                migrations: [
                                    {
                                        name: '001_first.ts',
                                        transaction: true,
                                        tables: [],
                                        metadataAvailable: true,
                                    },
                                    {
                                        name: '002_second.ts',
                                        transaction: true,
                                        tables: [],
                                        metadataAvailable: true,
                                    },
                                ],
                            },
                        },
                    ],
                }),
            ),
        });

        await expect(
            runMigrateCli(['preflight'], command.value),
        ).rejects.toThrow('Migration preflight aborted');

        expect(command.upgradeEvents).toEqual([
            {
                event: 'preflight_blocked',
                properties: expect.objectContaining({
                    migration_run_uuid: null,
                    span_migrations: 2,
                    failure_class: 'preflight_blocked',
                    preflight_decision: 'abort',
                    preflight_red: 1,
                    preflight_yellow: 0,
                    preflight_blocked_checks: ['postgres-version'],
                }),
            },
        ]);
        expect(
            Object.keys(command.upgradeEvents[0]?.properties ?? {}).sort(),
        ).toEqual(upgradePropertyKeys);
    });

    test('strict promotes yellow preflight results to an abort before lease claim', async () => {
        const manager = leaseManager();
        const command = context(manager, {
            runPreflight: vi.fn(async () =>
                preflightReport({
                    decision: 'abort',
                    strict: true,
                    summary: { red: 0, yellow: 1, info: 1 },
                }),
            ),
        });

        await expect(
            runMigrateCli(['up', '--strict'], command.value),
        ).rejects.toThrow(
            'Migration preflight aborted; resolve the blocking checks or pass --force to override',
        );

        expect(command.value.runPreflight).toHaveBeenCalledWith({
            force: false,
            strict: true,
        });
        expect(manager.claim).not.toHaveBeenCalled();
    });

    test('force overrides a red preflight with unmistakable warning logging', async () => {
        const manager = leaseManager();
        const command = context(manager, {
            runPreflight: vi.fn(async () =>
                preflightReport({
                    decision: 'force-proceed',
                    force: true,
                    summary: { red: 1, yellow: 0, info: 1 },
                }),
            ),
        });

        await runMigrateCli(['up', '--force'], command.value);

        expect(command.warnings).toContain(
            '!!! MIGRATION PREFLIGHT OVERRIDE ACTIVE: proceeding despite blocking checks because --force was supplied !!!',
        );
        expect(manager.claim).toHaveBeenCalledOnce();
    });

    test('status --json is read-only and accepts a database-ahead state', async () => {
        const manager = leaseManager();
        vi.mocked(manager.read).mockResolvedValue(
            readLease(heldLease({ claimToken: null })),
        );
        const command = context(manager, {
            getMigrationState: vi.fn(async () =>
                migrationState([], ['002_newer_database.ts']),
            ),
        });

        await runMigrateCli(['status', '--json'], command.value);

        expect(manager.claim).not.toHaveBeenCalled();
        expect(manager.unlock).not.toHaveBeenCalled();
        expect(JSON.parse(command.lines[0] ?? '')).toMatchObject({
            state: 'idle',
            knex: {
                pending: [],
                missing: ['002_newer_database.ts'],
                offending: [],
                classification: 'database-ahead',
            },
        });
    });

    test('status --json retains the full pending migration array', async () => {
        const manager = leaseManager();
        const pending = [
            '001_first.ts',
            '002_second.ts',
            '003_third.ts',
            '004_fourth.ts',
            '005_fifth.ts',
            '006_sixth.ts',
            '007_seventh.ts',
        ];
        const command = context(manager, {
            getMigrationState: vi.fn(async () => migrationState(pending)),
        });

        await runMigrateCli(['status', '--json'], command.value);

        expect(JSON.parse(command.lines[0] ?? '').knex.pending).toEqual(
            pending,
        );
    });

    test('up refuses a diverged ledger before claiming a lease or running migration work', async () => {
        const manager = leaseManager();
        const command = context(manager, {
            getMigrationState: vi.fn(async () =>
                migrationState(
                    ['002_second.ts'],
                    ['001_alien.ts', '001_other_alien.ts'],
                    ['001_alien.ts', '001_other_alien.ts'],
                ),
            ),
        });

        await expect(runMigrateCli(['up'], command.value)).rejects.toThrow(
            'Migration ledger diverged from local files; offending database-only migrations: 001_alien.ts, 001_other_alien.ts',
        );

        expect(manager.claim).not.toHaveBeenCalled();
        expect(command.value.clearKnexLock).not.toHaveBeenCalled();
        expect(command.value.migrateOne).not.toHaveBeenCalled();
        expect(command.value.runGraphileMigrations).not.toHaveBeenCalled();
    });

    test('wait refuses a diverged ledger before claiming a lease or running migration work', async () => {
        const manager = leaseManager();
        const command = context(manager, {
            getMigrationState: vi.fn(async () =>
                migrationState([], ['001_alien.ts'], ['001_alien.ts']),
            ),
        });

        await expect(runMigrateCli(['wait'], command.value)).rejects.toThrow(
            'Migration ledger diverged from local files; offending database-only migrations: 001_alien.ts',
        );

        expect(manager.claim).not.toHaveBeenCalled();
        expect(command.value.clearKnexLock).not.toHaveBeenCalled();
        expect(command.value.migrateOne).not.toHaveBeenCalled();
        expect(command.value.runGraphileMigrations).not.toHaveBeenCalled();
    });

    test('up re-checks the ledger after claiming and before clearing the Knex lock', async () => {
        const manager = leaseManager();
        const getMigrationState = vi
            .fn<MigrateCliContext['getMigrationState']>()
            .mockResolvedValueOnce(migrationState(['002_second.ts']))
            .mockResolvedValue(
                migrationState([], ['001_alien.ts'], ['001_alien.ts']),
            );
        const command = context(manager, {
            getMigrationState,
        });

        await expect(runMigrateCli(['up'], command.value)).rejects.toThrow(
            'Migration parked after 3 attempts at migration-state: Migration ledger diverged from local files; offending database-only migrations: 001_alien.ts',
        );

        expect(manager.claim).toHaveBeenCalledOnce();
        expect(command.value.clearKnexLock).not.toHaveBeenCalled();
        expect(command.value.migrateOne).not.toHaveBeenCalled();
        expect(command.value.runGraphileMigrations).not.toHaveBeenCalled();
        expect(manager.recordRetry).toHaveBeenCalledTimes(2);
        expect(manager.parkRun).toHaveBeenCalledOnce();
    });

    test('up runs pending local work when the database is legally ahead', async () => {
        const manager = leaseManager();
        const states = [
            migrationState(['002_local_pending.ts'], ['003_database_only.ts']),
            migrationState(['002_local_pending.ts'], ['003_database_only.ts']),
            migrationState([], ['003_database_only.ts']),
        ];
        const command = context(manager, {
            getMigrationState: vi.fn(
                async () => states.shift() ?? migrationState(),
            ),
        });

        await runMigrateCli(['up'], command.value);

        expect(command.value.migrateOne).toHaveBeenCalledWith(
            '002_local_pending.ts',
        );
        expect(command.value.runGraphileMigrations).toHaveBeenCalledOnce();
        expect(manager.completeRun).toHaveBeenCalledWith(
            'claim-a',
            expect.any(String),
        );
    });

    test('up clears the stale Knex lock, migrates files singly, runs Graphile, and releases', async () => {
        const manager = leaseManager();
        const states = [
            migrationState(['001_first.ts', '002_second.ts']),
            migrationState(['001_first.ts', '002_second.ts']),
            migrationState(['002_second.ts']),
            migrationState(),
        ];
        const command = context(manager, {
            getMigrationState: vi.fn(
                async () => states.shift() ?? migrationState(),
            ),
        });

        await runMigrateCli(['up'], command.value);

        expect(command.value.clearKnexLock).toHaveBeenCalledOnce();
        expect(command.value.migrateOne).toHaveBeenNthCalledWith(
            1,
            '001_first.ts',
        );
        expect(command.value.migrateOne).toHaveBeenNthCalledWith(
            2,
            '002_second.ts',
        );
        expect(manager.setCurrentMigration).toHaveBeenNthCalledWith(
            1,
            'claim-a',
            '001_first.ts',
        );
        expect(manager.setCurrentMigration).toHaveBeenNthCalledWith(
            2,
            'claim-a',
            '002_second.ts',
        );
        expect(manager.setCurrentMigration).toHaveBeenNthCalledWith(
            3,
            'claim-a',
            'graphile-worker',
        );
        expect(manager.setCurrentMigration).toHaveBeenNthCalledWith(
            4,
            'claim-a',
            null,
        );
        expect(command.value.runGraphileMigrations).toHaveBeenCalledOnce();
        expect(manager.completeRun).toHaveBeenCalledWith(
            'claim-a',
            expect.any(String),
        );
    });

    test('up cleans invalid pending indexes before running migrations', async () => {
        const manager = leaseManager();
        const events: string[] = [];
        const states = [
            migrationState(['001_first.ts']),
            migrationState(['001_first.ts']),
            migrationState(),
        ];
        const command = context(manager, {
            getMigrationState: vi.fn(
                async () => states.shift() ?? migrationState(),
            ),
            cleanupInvalidIndexes: vi.fn(async (pendingMigrationNames) => {
                expect(pendingMigrationNames).toEqual(['001_first.ts']);
                events.push('cleanup');
            }),
            migrateOne: vi.fn(async () => {
                events.push('migration');
            }),
        });

        await runMigrateCli(['up'], command.value);

        expect(events).toEqual(['cleanup', 'migration']);
    });

    test('a deterministic failure retries twice then parks the third attempt', async () => {
        const manager = leaseManager();
        const command = context(manager, {
            getMigrationState: vi.fn(async () =>
                migrationState(['001_failing.ts']),
            ),
            migrateOne: vi.fn(async () => {
                throw new Error('deterministic failure');
            }),
        });

        await expect(runMigrateCli(['up'], command.value)).rejects.toThrow(
            'Migration parked after 3 attempts at 001_failing.ts: deterministic failure',
        );

        expect(manager.startRun).toHaveBeenCalledTimes(3);
        expect(manager.recordRetry).toHaveBeenNthCalledWith(
            1,
            'claim-a',
            'run-1',
            '001_failing.ts',
            expect.stringContaining('deterministic failure'),
        );
        expect(manager.recordRetry).toHaveBeenNthCalledWith(
            2,
            'claim-a',
            'run-2',
            '001_failing.ts',
            expect.stringContaining('deterministic failure'),
        );
        expect(manager.parkRun).toHaveBeenCalledWith(
            'claim-a',
            'run-3',
            '1.2.3',
            '001_failing.ts',
            expect.stringContaining('deterministic failure'),
        );
        expect(manager.completeRun).not.toHaveBeenCalled();
        expect(command.value.migrateOne).toHaveBeenCalledTimes(3);
        expect(command.value.sleep).toHaveBeenNthCalledWith(1, 1);
        expect(command.value.sleep).toHaveBeenNthCalledWith(2, 2);
    });

    test('classifies a parked constraint failure without leaking raw error detail', async () => {
        const manager = leaseManager();
        const sentinel = 'SENTINEL_SCHEMA_LEAK_xyz';
        const failure = Object.assign(new Error(sentinel), {
            code: '23505',
        });
        failure.stack = `${sentinel}\nstack detail`;
        const command = context(manager, {
            getMigrationState: vi.fn(async () =>
                migrationState(['001_failing.ts']),
            ),
            migrateOne: vi.fn(async () => {
                throw failure;
            }),
        });

        await expect(runMigrateCli(['up'], command.value)).rejects.toThrow(
            sentinel,
        );

        const parkedEvent = command.upgradeEvents.find(
            ({ properties }) => properties.outcome === 'parked',
        );
        expect(parkedEvent).toMatchObject({
            event: 'upgrade_failed',
            properties: {
                migration_run_uuid: 'run-3',
                attempt: 3,
                outcome: 'parked',
                failure_class: 'constraint_violation',
                failing_migration: '001_failing.ts',
            },
        });
        expect(JSON.stringify(command.upgradeEvents)).not.toContain(sentinel);
        expect(vi.mocked(manager.parkRun).mock.calls[0]?.[4]).toContain(
            sentinel,
        );
    });

    test('the same app version does not reclaim a parked migration', async () => {
        const manager = leaseManager();
        const parkedLease = heldLease({
            claimToken: null,
            holderHostname: null,
            holderPodName: null,
            appVersion: null,
            startedAt: null,
            currentMigration: null,
            lastHeartbeat: null,
            parkedAt: new Date('2026-08-10T10:00:05.000Z'),
            parkedAppVersion: '1.2.3',
            parkedMigration: '001_failing.ts',
            parkedError: 'deterministic failure',
            parkedRunUuid: 'run-3',
        });
        vi.mocked(manager.claim).mockResolvedValue({
            status: 'held',
            token: null,
            lease: parkedLease,
        });
        vi.mocked(manager.read).mockResolvedValue(readLease(parkedLease));
        const command = context(manager, {
            getMigrationState: vi.fn(async () =>
                migrationState(['001_failing.ts']),
            ),
        });

        await expect(runMigrateCli(['up'], command.value)).rejects.toThrow(
            'Migration is parked for app version 1.2.3 at 001_failing.ts: deterministic failure; deploy a fixed version or run migrate unlock with operator attribution before retrying this version',
        );

        expect(manager.claim).toHaveBeenCalledOnce();
        expect(manager.startRun).not.toHaveBeenCalled();
        expect(command.value.migrateOne).not.toHaveBeenCalled();
    });

    test('an up follower promotes through the same claim path after expiry', async () => {
        const manager = leaseManager();
        vi.mocked(manager.claim)
            .mockResolvedValueOnce({
                status: 'held',
                token: null,
                lease: heldLease({ expired: true }),
            })
            .mockResolvedValueOnce(acquired('claim-b'));
        vi.mocked(manager.read).mockResolvedValue(
            readLease(heldLease({ expired: true })),
        );
        const states = [
            migrationState(['001_first.ts']),
            migrationState(['001_first.ts']),
            migrationState(['001_first.ts']),
            migrationState(),
        ];
        const command = context(manager, {
            getMigrationState: vi.fn(
                async () => states.shift() ?? migrationState(),
            ),
        });

        await runMigrateCli(['up'], command.value);

        expect(manager.claim).toHaveBeenCalledTimes(2);
        expect(command.lines).toContain(
            'Promoted follower to migration lease holder',
        );
        expect(manager.completeRun).toHaveBeenCalledWith(
            'claim-b',
            expect.any(String),
        );
    });

    test('emits takeover after started when the pre-claim lease is expired', async () => {
        const manager = leaseManager();
        vi.mocked(manager.read).mockResolvedValue(
            readLease(heldLease({ expired: true })),
        );
        const command = context(manager);

        await runMigrateCli(['up'], command.value);

        expect(command.upgradeEvents.map(({ event }) => event)).toEqual([
            'upgrade_started',
            'migration_lock_takeover',
            'upgrade_completed',
        ]);
        expect(command.upgradeEvents[1]?.properties).toMatchObject({
            migration_run_uuid: 'run-1',
            attempt: null,
            duration_seconds: null,
            outcome: null,
        });
    });

    test('does not emit takeover for a non-expired pre-claim lease', async () => {
        const manager = leaseManager();
        vi.mocked(manager.read).mockResolvedValue(readLease(heldLease()));
        const command = context(manager);

        await runMigrateCli(['up'], command.value);

        expect(command.upgradeEvents.map(({ event }) => event)).toEqual([
            'upgrade_started',
            'upgrade_completed',
        ]);
    });

    test('emits an abandoned failure when heartbeat lease loss escapes', async () => {
        const manager = leaseManager();
        const command = context(manager, {
            heartbeatLeaseManager: {
                heartbeat: vi.fn(async () => false),
            },
            heartbeatIntervalMs: 1,
            clearKnexLock: vi.fn(async () => {
                await new Promise<void>((resolve) => {
                    setTimeout(resolve, 5);
                });
            }),
        });

        await expect(
            runMigrateCli(['up'], command.value),
        ).rejects.toBeInstanceOf(MigrationLeaseLostError);

        expect(command.upgradeEvents.map(({ event }) => event)).toEqual([
            'upgrade_started',
            'upgrade_failed',
        ]);
        expect(command.upgradeEvents[1]?.properties).toMatchObject({
            migration_run_uuid: 'run-1',
            attempt: 1,
            outcome: null,
            failure_class: 'lease_lost',
            failing_migration: 'knex-lock-recovery',
        });
    });

    test('wait promotes through the same claim path when pending work is stale', async () => {
        const manager = leaseManager();
        vi.mocked(manager.read).mockResolvedValue(
            readLease(heldLease({ expired: true })),
        );
        vi.mocked(manager.claim).mockResolvedValue(acquired('claim-b'));
        const states = [
            migrationState(['001_first.ts']),
            migrationState(['001_first.ts']),
            migrationState(['001_first.ts']),
            migrationState(),
        ];
        const command = context(manager, {
            getMigrationState: vi.fn(
                async () => states.shift() ?? migrationState(),
            ),
        });

        await runMigrateCli(['wait'], command.value);

        expect(manager.claim).toHaveBeenCalledOnce();
        expect(command.lines).toContain(
            'Promoted follower to migration lease holder',
        );
        expect(manager.completeRun).toHaveBeenCalledWith(
            'claim-b',
            expect.any(String),
        );
    });

    test('polling logs pending names and the holder on every pass', async () => {
        const manager = leaseManager();
        vi.mocked(manager.read)
            .mockResolvedValueOnce(readLease(heldLease()))
            .mockResolvedValueOnce(readLease(null));
        const states = [migrationState(['001_first.ts']), migrationState()];
        const command = context(manager, {
            getMigrationState: vi.fn(
                async () => states.shift() ?? migrationState(),
            ),
        });

        await runMigrateCli(['wait'], command.value);

        expect(
            command.lines.filter((line) =>
                line.startsWith('Pending migrations:'),
            ),
        ).toEqual([
            'Pending migrations: 1 (001_first.ts)',
            'Pending migrations: 0',
        ]);
        expect(
            command.lines.filter((line) =>
                line.startsWith('Migration lease holder:'),
            ),
        ).toHaveLength(2);
    });

    test('polling compacts long pending migration lists', async () => {
        const manager = leaseManager();
        vi.mocked(manager.read)
            .mockResolvedValueOnce(readLease(heldLease()))
            .mockResolvedValueOnce(readLease(null));
        const states = [
            migrationState([
                '001_first.ts',
                '002_second.ts',
                '003_third.ts',
                '004_fourth.ts',
                '005_fifth.ts',
                '006_sixth.ts',
                '007_seventh.ts',
            ]),
            migrationState(),
        ];
        const command = context(manager, {
            getMigrationState: vi.fn(
                async () => states.shift() ?? migrationState(),
            ),
        });

        await runMigrateCli(['wait'], command.value);

        expect(command.lines[0]).toBe(
            'Pending migrations: 7 (001_first.ts, 002_second.ts, 003_third.ts, 004_fourth.ts, 005_fifth.ts, … and 2 more)',
        );
    });

    test('a null lease with no pending work completes without promotion', async () => {
        const manager = leaseManager();
        const command = context(manager);

        await runMigrateCli(['wait'], command.value);

        expect(manager.claim).not.toHaveBeenCalled();
        expect(command.lines).toContain('Database migrations are complete');
    });

    test('status reports a stale lease explicitly', async () => {
        const manager = leaseManager();
        vi.mocked(manager.read).mockResolvedValue(
            readLease(heldLease({ expired: true })),
        );
        const command = context(manager);

        await runMigrateCli(['status'], command.value);

        expect(command.lines).toContain('Migration state: stale');
    });

    test('status renders the parked state and run history', async () => {
        const manager = leaseManager();
        vi.mocked(manager.read).mockResolvedValue(
            readLease(
                heldLease({
                    claimToken: null,
                    holderHostname: null,
                    holderPodName: null,
                    appVersion: null,
                    startedAt: null,
                    currentMigration: null,
                    lastHeartbeat: null,
                    parkedAt: new Date('2026-08-10T10:00:05.000Z'),
                    parkedAppVersion: '1.2.3',
                    parkedMigration: '001_first.ts',
                    parkedError: 'deterministic failure',
                    parkedRunUuid: 'run-2',
                }),
            ),
        );
        vi.mocked(manager.readRunHistory).mockResolvedValue({
            initialized: true,
            runs: [
                migrationRun({
                    runUuid: 'run-2',
                    attempt: 2,
                    outcome: 'parked',
                    failingMigration: '001_first.ts',
                    failureDetail: 'deterministic failure',
                    lastUnlockedBy: 'operator@example.com',
                    lastUnlockedAt: new Date('2026-08-10T09:55:00.000Z'),
                    lastUnlockForced: true,
                }),
                migrationRun({
                    attempt: 1,
                    outcome: 'retrying',
                    failingMigration: '001_first.ts',
                    failureDetail: 'deterministic failure',
                }),
            ],
        });
        const command = context(manager);

        await runMigrateCli(['status'], command.value);

        expect(command.lines).toContain('Migration state: parked');
        expect(command.lines).toContain(
            'Parked migration: version=1.2.3 migration=001_first.ts at=2026-08-10T10:00:05.000Z run=run-2 error=deterministic failure',
        );
        expect(command.lines).toContainEqual(
            expect.stringContaining(
                'Migration run run-2: outcome=parked attempt=2',
            ),
        );
        expect(command.lines).toContainEqual(
            expect.stringContaining(
                'preceding_unlock=operator@example.com at 2026-08-10T09:55:00.000Z forced=true',
            ),
        );
        expect(command.lines).toContainEqual(
            expect.stringContaining(
                'Migration run run-1: outcome=retrying attempt=1',
            ),
        );
    });

    test('status compacts long pending migration lists', async () => {
        const manager = leaseManager();
        const command = context(manager, {
            getMigrationState: vi.fn(async () =>
                migrationState([
                    '001_first.ts',
                    '002_second.ts',
                    '003_third.ts',
                    '004_fourth.ts',
                    '005_fifth.ts',
                    '006_sixth.ts',
                ]),
            ),
        });

        await runMigrateCli(['status'], command.value);

        expect(command.lines).toContain(
            'Pending Knex migrations: 6 (001_first.ts, 002_second.ts, 003_third.ts, 004_fourth.ts, 005_fifth.ts, … and 1 more)',
        );
    });

    test('status reports a diverged ledger without describing it as database-ahead', async () => {
        const manager = leaseManager();
        const command = context(manager, {
            getMigrationState: vi.fn(async () =>
                migrationState([], ['001_alien.ts'], ['001_alien.ts']),
            ),
        });

        await runMigrateCli(['status'], command.value);

        expect(command.lines).toContain(
            'Knex migration classification: diverged',
        );
        expect(command.lines).toContain(
            'Database-only migrations: 001_alien.ts',
        );
    });

    test('emits one deprecation warning without changing migrate behavior', async () => {
        const manager = leaseManager();
        const command = context(manager, {
            allowMissingMigrations: true,
        });

        await runMigrateCli(['wait'], command.value);

        expect(command.warnings).toEqual([
            'ALLOW_MISSING_MIGRATIONS is deprecated for the migrate CLI; the version gate now handles database-ahead migrations automatically.',
        ]);
        expect(command.lines).toContain('Database migrations are complete');
    });

    test('non-force unlock proceeds when the lease claim token is null and the Knex lock is free', async () => {
        const manager = leaseManager();
        vi.mocked(manager.read).mockResolvedValue(
            readLease(heldLease({ claimToken: null })),
        );
        const command = context(manager);

        await runMigrateCli(
            ['unlock', '--actor', 'operator@example.com'],
            command.value,
        );

        expect(manager.unlock).toHaveBeenCalledWith(
            'operator@example.com',
            false,
        );
        expect(command.value.isKnexLockHeld).toHaveBeenCalledOnce();
        expect(command.value.clearKnexLock).toHaveBeenCalledOnce();
        expect(command.lines).toEqual([
            'Migration locks cleared by operator@example.com at 2026-08-10T10:05:00.000Z',
        ]);
    });

    test('non-force unlock refuses a fresh claimed lease when the Knex lock is free', async () => {
        const manager = leaseManager();
        vi.mocked(manager.read).mockResolvedValue(readLease(heldLease()));
        vi.mocked(manager.unlock).mockResolvedValue({
            status: 'held',
            lease: heldLease(),
        });
        const command = context(manager, {
            now: () => new Date('2026-08-10T10:00:42.900Z').getTime(),
            isKnexLockHeld: vi.fn(async () => false),
        });

        await expect(
            runMigrateCli(
                ['unlock', '--actor', 'operator@example.com'],
                command.value,
            ),
        ).rejects.toThrow(
            'Lease is actively held by host-a/pod-a (last heartbeat 32s ago) — terminate the holder first, or pass --force to override',
        );

        expect(manager.unlock).toHaveBeenCalledWith(
            'operator@example.com',
            false,
        );
        expect(command.value.isKnexLockHeld).not.toHaveBeenCalled();
        expect(command.value.clearKnexLock).not.toHaveBeenCalled();
        expect(command.lines).toEqual([]);
    });

    test('a fresh claimed lease shadows a held Knex lock with the holder refusal', async () => {
        const manager = leaseManager();
        vi.mocked(manager.read).mockResolvedValue(readLease(heldLease()));
        vi.mocked(manager.unlock).mockResolvedValue({
            status: 'held',
            lease: heldLease(),
        });
        const command = context(manager, {
            now: () => new Date('2026-08-10T10:00:42.900Z').getTime(),
            isKnexLockHeld: vi.fn(async () => true),
        });

        await expect(
            runMigrateCli(
                ['unlock', '--actor', 'operator@example.com'],
                command.value,
            ),
        ).rejects.toThrow(
            'Lease is actively held by host-a/pod-a (last heartbeat 32s ago) — terminate the holder first, or pass --force to override',
        );

        expect(manager.unlock).toHaveBeenCalledWith(
            'operator@example.com',
            false,
        );
        expect(command.value.isKnexLockHeld).not.toHaveBeenCalled();
        expect(command.value.clearKnexLock).not.toHaveBeenCalled();
        expect(command.lines).toEqual([]);
    });

    test('non-force unlock clears an expired claimed lease and the Knex lock', async () => {
        const manager = leaseManager();
        vi.mocked(manager.read).mockResolvedValue(
            readLease(heldLease({ expired: true })),
        );
        const command = context(manager, {
            isKnexLockHeld: vi.fn(async () => true),
        });

        await runMigrateCli(
            ['unlock', '--actor', 'operator@example.com'],
            command.value,
        );

        expect(manager.unlock).toHaveBeenCalledWith(
            'operator@example.com',
            false,
        );
        expect(command.value.isKnexLockHeld).not.toHaveBeenCalled();
        expect(command.value.clearKnexLock).toHaveBeenCalledOnce();
        expect(command.lines).toEqual([
            'Migration locks cleared by operator@example.com at 2026-08-10T10:05:00.000Z',
        ]);
    });

    test('non-force unlock refuses a legacy Knex lock when the lease claim token is null', async () => {
        const manager = leaseManager();
        vi.mocked(manager.read).mockResolvedValue(
            readLease(heldLease({ claimToken: null })),
        );
        const command = context(manager, {
            isKnexLockHeld: vi.fn(async () => true),
        });

        await expect(
            runMigrateCli(
                ['unlock', '--actor', 'operator@example.com'],
                command.value,
            ),
        ).rejects.toThrow(
            'Knex migration lock is still held in knex_migrations_lock; a legacy migrator may still be running — terminate it first, or pass --force to override',
        );

        expect(manager.unlock).not.toHaveBeenCalled();
        expect(command.value.isKnexLockHeld).toHaveBeenCalledOnce();
        expect(command.value.clearKnexLock).not.toHaveBeenCalled();
        expect(command.lines).toEqual([]);
    });

    test('force unlock clears a fresh lease with forced attribution', async () => {
        const manager = leaseManager();
        const command = context(manager);

        await runMigrateCli(
            ['unlock', '--actor', 'operator@example.com', '--force'],
            command.value,
        );

        expect(manager.unlock).toHaveBeenCalledWith(
            'operator@example.com',
            true,
        );
        expect(command.value.isKnexLockHeld).not.toHaveBeenCalled();
        expect(command.value.clearKnexLock).toHaveBeenCalledOnce();
        expect(command.lines).toEqual([
            'Migration locks cleared by operator@example.com at 2026-08-10T10:05:00.000Z (forced)',
        ]);
    });

    test.each([
        ['up', '--help'],
        ['up', '-h'],
        ['status', '--help'],
        ['status', '-h'],
        ['preflight', '--help'],
        ['preflight', '-h'],
        ['wait', '--help'],
        ['wait', '-h'],
        ['unlock', '--help'],
        ['unlock', '-h'],
    ])('shows help for %s %s without running work', async (verb, helpFlag) => {
        const manager = leaseManager();
        const command = context(manager);

        await runMigrateCli([verb, helpFlag], command.value);

        expect(command.lines).toHaveLength(1);
        expect(command.lines[0]).toContain('migrate [up]');
        expect(command.lines[0]).toContain('migrate status [--json]');
        expect(command.lines[0]).toContain(
            'migrate preflight [--strict] [--force] [--json]',
        );
        expect(command.lines[0]).toContain(
            'migrate wait [--timeout-ms <milliseconds>]',
        );
        expect(command.lines[0]).toContain(
            'migrate unlock --actor <identity> [--force]',
        );
        expect(command.lines[0]).toContain('-h, --help');
        expect(command.lines[0]).toContain(
            '--json                       Emit the status or preflight payload as JSON',
        );
        expect(command.lines[0]).toContain(
            '--force                      Override blocking preflight checks, an active lease, or a legacy Knex lock',
        );
        expect(manager.read).not.toHaveBeenCalled();
        expect(manager.claim).not.toHaveBeenCalled();
        expect(manager.unlock).not.toHaveBeenCalled();
    });

    test.each(['--help', '-h'])('shows top-level help for %s', async (flag) => {
        const manager = leaseManager();
        const command = context(manager);

        await runMigrateCli([flag], command.value);

        expect(command.lines[0]).toContain('Commands:');
        expect(command.lines[0]).toContain('Flags:');
    });
});

describe('parseMigrationWaitTimeoutMs', () => {
    test('uses the 30 minute default and accepts a positive safe integer', () => {
        expect(parseMigrationWaitTimeoutMs(undefined)).toEqual(30 * 60_000);
        expect(parseMigrationWaitTimeoutMs('45000')).toEqual(45_000);
    });

    test.each(['NaN', '0', '-1', '1.5', '9007199254740992'])(
        'rejects invalid timeout %s',
        (value) => {
            expect(() => parseMigrationWaitTimeoutMs(value)).toThrow(
                'MIGRATION_WAIT_TIMEOUT_MS must be a positive integer',
            );
        },
    );
});

describe('parseMigrateCliOptions', () => {
    test('accepts force for unlock', () => {
        expect(
            parseMigrateCliOptions(
                ['unlock', '--actor', 'operator@example.com', '--force'],
                1_800_000,
            ),
        ).toMatchObject({
            command: 'unlock',
            actor: 'operator@example.com',
            force: true,
        });
    });

    test.each(['status', 'wait'])('rejects force for %s', (command) => {
        expect(() =>
            parseMigrateCliOptions([command, '--force'], 1_800_000),
        ).toThrow('--force is only valid with up, preflight, or unlock');
    });

    test.each([
        ['up', ['--force', '--strict']],
        ['preflight', ['--force', '--strict', '--json']],
    ])('accepts safety flags for %s', (command, flags) => {
        expect(
            parseMigrateCliOptions([command, ...flags], 1_800_000),
        ).toMatchObject({
            command,
            force: true,
            strict: true,
            json: command === 'preflight',
        });
    });

    test.each(['status', 'wait', 'unlock'])(
        'rejects strict for %s',
        (command) => {
            const args =
                command === 'unlock'
                    ? [command, '--actor', 'operator@example.com', '--strict']
                    : [command, '--strict'];
            expect(() => parseMigrateCliOptions(args, 1_800_000)).toThrow(
                '--strict is only valid with up or preflight',
            );
        },
    );

    test('rejects json for up even when other safety flags are valid', () => {
        expect(() =>
            parseMigrateCliOptions(
                ['up', '--strict', '--force', '--json'],
                1_800_000,
            ),
        ).toThrow('--json is only valid with status or preflight');
    });

    test('rejects an explicitly supplied default timeout for status', () => {
        expect(() =>
            parseMigrateCliOptions(
                ['status', '--timeout-ms', '1800000'],
                1_800_000,
            ),
        ).toThrow('--timeout-ms is only valid with up or wait');
    });

    test('rejects an explicitly supplied default timeout for unlock', () => {
        expect(() =>
            parseMigrateCliOptions(
                [
                    'unlock',
                    '--timeout-ms',
                    '1800000',
                    '--actor',
                    'operator@example.com',
                ],
                1_800_000,
            ),
        ).toThrow('--timeout-ms is only valid with up or wait');
    });
});
