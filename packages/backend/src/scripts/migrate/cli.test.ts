import {
    type MigrationLease,
    type MigrationLeaseClaimResult,
    type MigrationLeaseReadResult,
} from '../../database/migrationLease';
import {
    createMigrateCliContext,
    parseMigrationWaitTimeoutMs,
    runMigrateCli,
    type MigrateCliContext,
    type MigrationLeaseCommandClient,
} from './cli';
import { type KnexMigrationState } from './migrationState';

const migrationState = (
    pending: string[] = [],
    missing: string[] = [],
): KnexMigrationState => ({
    completed: [],
    pending,
    missing,
    databaseAhead: missing.length > 0,
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

const leaseManager = (): MigrationLeaseCommandClient => ({
    claim: vi.fn(async () => acquired()),
    heartbeat: vi.fn(async () => true),
    setCurrentMigration: vi.fn(async () => true),
    release: vi.fn(async () => true),
    unlock: vi.fn(async (actor) =>
        heldLease({
            claimToken: null,
            holderHostname: null,
            holderPodName: null,
            appVersion: null,
            startedAt: null,
            currentMigration: null,
            lastHeartbeat: null,
            lastUnlockedBy: actor,
            lastUnlockedAt: new Date('2026-08-10T10:05:00.000Z'),
        }),
    ),
    read: vi.fn(async () => readLease(null)),
});

const context = (
    manager: MigrationLeaseCommandClient,
    overrides: Partial<MigrateCliContext> = {},
) => {
    const lines: string[] = [];
    const errors: string[] = [];
    return {
        lines,
        errors,
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
            migrateOne: vi.fn(async () => {}),
            clearKnexLock: vi.fn(async () => {}),
            runGraphileMigrations: vi.fn(async () => {}),
            log: (line) => lines.push(line),
            logError: (line) => errors.push(line),
            onLeaseLost: vi.fn(),
            sleep: vi.fn(async () => {}),
            heartbeatIntervalMs: 60_000,
            ...overrides,
        }),
    };
};

describe('runMigrateCli', () => {
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
                databaseAhead: true,
            },
        });
    });

    test('up clears the stale Knex lock, migrates files singly, runs Graphile, and releases', async () => {
        const manager = leaseManager();
        const states = [
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
        expect(manager.release).toHaveBeenCalledWith('claim-a');
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
        expect(manager.release).toHaveBeenCalledWith('claim-b');
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
        expect(manager.release).toHaveBeenCalledWith('claim-b');
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
            'Pending migrations: 001_first.ts',
            'Pending migrations: none',
        ]);
        expect(
            command.lines.filter((line) =>
                line.startsWith('Migration lease holder:'),
            ),
        ).toHaveLength(2);
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

    test('unlock invalidates the lease, clears Knex lock, and prints attribution', async () => {
        const manager = leaseManager();
        const command = context(manager);

        await runMigrateCli(
            ['unlock', '--actor', 'operator@example.com'],
            command.value,
        );

        expect(manager.unlock).toHaveBeenCalledWith('operator@example.com');
        expect(command.value.clearKnexLock).toHaveBeenCalledOnce();
        expect(command.lines).toEqual([
            'Migration locks cleared by operator@example.com at 2026-08-10T10:05:00.000Z',
        ]);
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
