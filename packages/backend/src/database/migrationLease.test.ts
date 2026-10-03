import knex, { type Knex } from 'knex';
import { getTracker, MockClient, type Tracker } from 'knex-mock-client';
import {
    MIGRATION_LEASE_EXPIRY_MS,
    MigrationLeaseManager,
    type MigrationLeaseIdentity,
} from './migrationLease';
import { MIGRATION_LEASE_SCHEMA_SQL } from './migrationLeaseSchema';
import { MIGRATION_PARK_CLASS_SCHEMA_SQL } from './migrationParkClassSchema';
import { MIGRATION_RUN_LEDGER_SCHEMA_SQL } from './migrationRunLedgerSchema';
import { MIGRATION_LEASE_SCHEMA_SQL as FROZEN_MIGRATION_LEASE_SCHEMA_SQL } from './migrations/20260810120000_create_migration_lease';
import { MIGRATION_RUN_LEDGER_SCHEMA_SQL as FROZEN_MIGRATION_RUN_LEDGER_SCHEMA_SQL } from './migrations/20260811122500_create_migration_run_ledger';
import { MIGRATION_PARK_CLASS_SCHEMA_SQL as FROZEN_MIGRATION_PARK_CLASS_SCHEMA_SQL } from './migrations/20260924100000_add_migration_lease_parked_error_class';

const identity: MigrationLeaseIdentity = {
    hostname: 'host-a',
    podName: 'pod-a',
    appVersion: '1.2.3',
};

const startedAt = new Date('2026-08-10T10:00:00.000Z');
const transientParkCooloffMs = 120_000;

const databaseRow = (
    token: string | null,
    lastHeartbeat: Date | null = startedAt,
) => ({
    lease_key: 'global',
    holder_hostname: token === null ? null : identity.hostname,
    holder_pod_name: token === null ? null : identity.podName,
    app_version: token === null ? null : identity.appVersion,
    claim_token: token,
    started_at: token === null ? null : startedAt,
    current_migration: null,
    last_heartbeat: token === null ? null : lastHeartbeat,
    last_unlocked_by: null,
    last_unlocked_at: null,
    last_unlock_forced: false,
    parked_at: null,
    parked_app_version: null,
    parked_migration: null,
    parked_error: null,
    parked_run_uuid: null,
    parked_error_class: null,
});

const parkedDatabaseRow = (errorClass: 'transient' | 'deterministic') => ({
    ...databaseRow(null),
    parked_at: new Date('2026-08-10T10:00:05.000Z'),
    parked_app_version: identity.appVersion,
    parked_migration: '002_next.ts',
    parked_error: 'canceling statement due to lock timeout',
    parked_run_uuid: '00000000-0000-4000-8000-000000000003',
    parked_error_class: errorClass,
});

const runDatabaseRow = (overrides: Record<string, unknown> = {}) => ({
    migration_run_uuid: '00000000-0000-4000-8000-000000000001',
    claim_token: 'claim-a',
    holder_hostname: identity.hostname,
    holder_pod_name: identity.podName,
    app_version: identity.appVersion,
    from_migration: '001_previous.ts',
    to_migration: '002_next.ts',
    attempt: 1,
    started_at: startedAt,
    finished_at: new Date('2026-08-10T10:00:05.000Z'),
    outcome: 'succeeded',
    failing_migration: null,
    failure_detail: null,
    last_unlocked_by: null,
    last_unlocked_at: null,
    last_unlock_forced: false,
    ...overrides,
});

let database: Knex;
let tracker: Tracker;

const manager = (token: string) =>
    new MigrationLeaseManager({
        database,
        tokenFactory: () => token,
        runIdFactory: () => '00000000-0000-4000-8000-000000000001',
        bootstrapDelay: async () => {},
    });

const handleBootstrap = () => {
    tracker.on.any(/CREATE EXTENSION IF NOT EXISTS "uuid-ossp"/).response([]);
    tracker.on.any(MIGRATION_LEASE_SCHEMA_SQL).response([]);
    tracker.on.any(MIGRATION_RUN_LEDGER_SCHEMA_SQL).response([]);
    tracker.on.any(MIGRATION_PARK_CLASS_SCHEMA_SQL).response([]);
};

const handleInitializedSchema = () => {
    tracker.on.any(/information_schema\.tables/).response([{}]);
    tracker.on.any(/information_schema\.columns/).response([{}]);
};

beforeAll(() => {
    database = knex({ client: MockClient, dialect: 'pg' });
    tracker = getTracker();
});

afterEach(() => {
    tracker.reset();
});

afterAll(async () => {
    await database.destroy();
});

describe('MigrationLeaseManager', () => {
    test('keeps the frozen migration DDL identical to the runtime bootstrap DDL', () => {
        expect(MIGRATION_LEASE_SCHEMA_SQL).toEqual(
            FROZEN_MIGRATION_LEASE_SCHEMA_SQL,
        );
        expect(MIGRATION_RUN_LEDGER_SCHEMA_SQL).toEqual(
            FROZEN_MIGRATION_RUN_LEDGER_SCHEMA_SQL,
        );
        expect(MIGRATION_PARK_CLASS_SCHEMA_SQL).toEqual(
            FROZEN_MIGRATION_PARK_CLASS_SCHEMA_SQL,
        );
    });

    test('uses the runtime schema during bootstrap', async () => {
        handleBootstrap();
        await manager('claim-a').ensureSchema();
        expect(tracker.history.any).toHaveLength(4);
        expect(tracker.history.any[0]?.sql).toContain('uuid-ossp');
        expect(tracker.history.any[1]?.sql).toEqual(MIGRATION_LEASE_SCHEMA_SQL);
        expect(tracker.history.any[2]?.sql).toEqual(
            MIGRATION_RUN_LEDGER_SCHEMA_SQL,
        );
        expect(tracker.history.any[3]?.sql).toEqual(
            MIGRATION_PARK_CLASS_SCHEMA_SQL,
        );
    });

    test('claims an idle singleton lease with a new opaque token', async () => {
        handleBootstrap();
        tracker.on.update('migration_lease').response([databaseRow('claim-a')]);

        const result = await manager('claim-a').claim(
            identity,
            transientParkCooloffMs,
        );

        expect(result.status).toEqual('acquired');
        expect(result.token).toEqual('claim-a');
        expect(result.lease.claimToken).toEqual('claim-a');
        expect(tracker.history.update[0]?.sql).toContain(
            '"last_heartbeat" <= CURRENT_TIMESTAMP',
        );
        expect(tracker.history.update[0]?.bindings).toContain(
            MIGRATION_LEASE_EXPIRY_MS,
        );
        expect(tracker.history.update[0]?.sql).toContain('"parked_at" is null');
        expect(tracker.history.update[0]?.bindings).toContain(
            identity.appVersion,
        );
    });

    test('a competing claim observes the current holder', async () => {
        handleBootstrap();
        tracker.on.update('migration_lease').response([]);
        handleInitializedSchema();
        tracker.on
            .select('migration_lease')
            .response([{ ...databaseRow('claim-a'), expired: false }]);

        const result = await manager('claim-b').claim(
            identity,
            transientParkCooloffMs,
        );

        expect(result).toMatchObject({
            status: 'held',
            token: null,
            lease: {
                claimToken: 'claim-a',
                expired: false,
            },
        });
    });

    test('reads the legacy lease shape before the run ledger migration', async () => {
        tracker.on
            .any((query) => query.bindings.includes('migration_lease'))
            .response(true);
        tracker.on
            .any((query) => query.bindings.includes('migration_run_ledger'))
            .response(false);
        tracker.on
            .select('migration_lease')
            .response([{ ...databaseRow(null), expired: false }]);

        const result = await manager('claim-a').read();

        expect(result).toMatchObject({
            initialized: true,
            lease: {
                lastUnlockForced: false,
                parkedAt: null,
                parkedAppVersion: null,
                parkedMigration: null,
                parkedError: null,
                parkedRunUuid: null,
            },
        });
        expect(tracker.history.select[0]?.sql).not.toContain('parked_at');
    });

    test('reads the ledger lease shape before the parked error class column exists', async () => {
        tracker.on
            .any((query) => query.bindings.includes('parked_error_class'))
            .response(false);
        tracker.on
            .any((query) => query.bindings.includes('migration_lease'))
            .response(true);
        tracker.on
            .any((query) => query.bindings.includes('migration_run_ledger'))
            .response(true);
        const { parked_error_class: parkedErrorClass, ...ledgerRow } =
            parkedDatabaseRow('deterministic');
        tracker.on
            .select('migration_lease')
            .response([{ ...ledgerRow, expired: false }]);

        const result = await manager('claim-a').read();

        expect(parkedErrorClass).toEqual('deterministic');
        expect(result).toMatchObject({
            initialized: true,
            lease: {
                parkedAppVersion: identity.appVersion,
                parkedMigration: '002_next.ts',
                parkedErrorClass: null,
            },
        });
        expect(tracker.history.select[0]?.sql).toContain('parked_at');
        expect(tracker.history.select[0]?.sql).not.toContain(
            'parked_error_class',
        );
    });

    test('reads the parked error class when the column exists', async () => {
        handleInitializedSchema();
        tracker.on
            .select('migration_lease')
            .response([{ ...parkedDatabaseRow('transient'), expired: false }]);

        const result = await manager('claim-a').read();

        expect(result).toMatchObject({
            initialized: true,
            lease: {
                parkedAppVersion: identity.appVersion,
                parkedErrorClass: 'transient',
            },
        });
        expect(tracker.history.select[0]?.sql).toContain('parked_error_class');
    });

    test('parks a transient failure and reads the class back', async () => {
        tracker.on.update('migration_run_ledger').responseOnce([
            {
                migration_run_uuid: '00000000-0000-4000-8000-000000000003',
            },
        ]);
        tracker.on
            .update('migration_lease')
            .responseOnce([{ lease_key: 'global' }]);
        handleInitializedSchema();
        tracker.on
            .select('migration_lease')
            .response([{ ...parkedDatabaseRow('transient'), expired: false }]);
        const leaseManager = manager('claim-a');

        await expect(
            leaseManager.parkRun(
                'claim-a',
                '00000000-0000-4000-8000-000000000003',
                identity.appVersion,
                '002_next.ts',
                'canceling statement due to lock timeout',
                'transient',
            ),
        ).resolves.toBe(true);
        const result = await leaseManager.read();

        expect(tracker.history.update[1]?.sql).toContain(
            '"parked_error_class" = ',
        );
        expect(tracker.history.update[1]?.bindings).toContain('transient');
        expect(result.lease?.parkedErrorClass).toEqual('transient');
    });

    test('lets the same version reclaim only a transient park after the cool-off', async () => {
        handleBootstrap();
        tracker.on.update('migration_lease').response([
            {
                ...parkedDatabaseRow('transient'),
                ...databaseRow('claim-a'),
                parked_at: new Date('2026-08-10T10:00:05.000Z'),
                parked_app_version: identity.appVersion,
                parked_error_class: 'transient',
            },
        ]);

        const result = await manager('claim-a').claim(
            identity,
            transientParkCooloffMs,
        );

        expect(result).toMatchObject({
            status: 'acquired',
            lease: { parkedErrorClass: 'transient' },
        });
        const claimSql = tracker.history.update[0]?.sql ?? '';
        expect(claimSql).toContain('"parked_error_class" = ');
        expect(claimSql).toContain('"parked_at" <= CURRENT_TIMESTAMP');
        expect(tracker.history.update[0]?.bindings).toEqual(
            expect.arrayContaining(['transient', transientParkCooloffMs]),
        );
    });

    test('completion and unlock clear the parked error class', async () => {
        tracker.on.update('migration_run_ledger').responseOnce([
            {
                migration_run_uuid: '00000000-0000-4000-8000-000000000002',
            },
        ]);
        tracker.on
            .update('migration_lease')
            .responseOnce([{ lease_key: 'global' }]);
        handleBootstrap();
        tracker.on.update('migration_lease').responseOnce([databaseRow(null)]);
        const leaseManager = manager('claim-a');

        await leaseManager.completeRun(
            'claim-a',
            '00000000-0000-4000-8000-000000000002',
        );
        await leaseManager.unlock('operator@example.com', true);

        expect(tracker.history.update[1]?.sql).toContain(
            '"parked_error_class" = ',
        );
        expect(tracker.history.update[2]?.sql).toContain(
            '"parked_error_class" = ',
        );
    });

    test('heartbeat renews only the matching token', async () => {
        const renewedAt = new Date('2026-08-10T10:00:10.000Z');
        tracker.on
            .update('migration_lease')
            .response([{ lease_key: 'global', last_heartbeat: renewedAt }]);

        await expect(manager('claim-a').heartbeat('claim-a')).resolves.toBe(
            true,
        );
        expect(tracker.history.update[0]?.bindings).toContain('claim-a');
    });

    test('starts a run with version and unlock attribution', async () => {
        tracker.on.insert('migration_run_ledger').response([
            {
                migration_run_uuid: '00000000-0000-4000-8000-000000000001',
            },
        ]);

        const runUuid = await manager('claim-a').startRun({
            token: 'claim-a',
            identity,
            fromMigration: '001_previous.ts',
            toMigration: '002_next.ts',
            attempt: 1,
            lastUnlockedBy: 'operator@example.com',
            lastUnlockedAt: new Date('2026-08-10T09:55:00.000Z'),
            lastUnlockForced: true,
        });

        expect(runUuid).toEqual('00000000-0000-4000-8000-000000000001');
        expect(tracker.history.insert[0]?.bindings).toEqual(
            expect.arrayContaining([
                'claim-a',
                identity.hostname,
                identity.podName,
                identity.appVersion,
                '001_previous.ts',
                '002_next.ts',
                'running',
                'operator@example.com',
                true,
            ]),
        );
    });

    test('reads the latest succeeded run instead of a later failed run', async () => {
        handleInitializedSchema();
        tracker.on.select('migration_run_ledger').response([
            runDatabaseRow({
                app_version: '1.1.0',
                started_at: new Date('2026-08-10T09:00:00.000Z'),
            }),
        ]);

        const result = await manager('claim-a').readLastSucceededRun();

        expect(result).toMatchObject({
            appVersion: '1.1.0',
            outcome: 'succeeded',
        });
        expect(tracker.history.select[0]?.sql).toContain(
            'where "outcome" = $1',
        );
        expect(tracker.history.select[0]?.bindings).toContain('succeeded');
        expect(tracker.history.select[0]?.sql).toContain(
            'order by "started_at" desc',
        );
    });

    test('reads no last succeeded run from an empty or uninitialized ledger', async () => {
        tracker.on
            .any((query) => query.bindings.includes('migration_run_ledger'))
            .responseOnce(false);
        tracker.on
            .any((query) => query.bindings.includes('migration_run_ledger'))
            .responseOnce(true);
        tracker.on.select('migration_run_ledger').response([]);
        const leaseManager = manager('claim-a');

        await expect(leaseManager.readLastSucceededRun()).resolves.toBeNull();
        await expect(leaseManager.readLastSucceededRun()).resolves.toBeNull();
    });

    test('records retry and terminal outcomes against the owned run', async () => {
        tracker.on.update('migration_run_ledger').responseOnce([
            {
                migration_run_uuid: '00000000-0000-4000-8000-000000000001',
            },
        ]);
        tracker.on.update('migration_run_ledger').responseOnce([
            {
                migration_run_uuid: '00000000-0000-4000-8000-000000000002',
            },
        ]);
        tracker.on.update('migration_run_ledger').responseOnce([
            {
                migration_run_uuid: '00000000-0000-4000-8000-000000000003',
            },
        ]);
        tracker.on
            .update('migration_lease')
            .responseOnce([{ lease_key: 'global' }]);
        tracker.on
            .update('migration_lease')
            .responseOnce([{ lease_key: 'global' }]);
        const leaseManager = manager('claim-a');

        await expect(
            leaseManager.recordRetry(
                'claim-a',
                '00000000-0000-4000-8000-000000000001',
                '002_next.ts',
                'transient failure',
            ),
        ).resolves.toBe(true);
        await expect(
            leaseManager.completeRun(
                'claim-a',
                '00000000-0000-4000-8000-000000000002',
            ),
        ).resolves.toBe(true);
        await expect(
            leaseManager.parkRun(
                'claim-a',
                '00000000-0000-4000-8000-000000000003',
                identity.appVersion,
                '002_next.ts',
                'deterministic failure',
                'deterministic',
            ),
        ).resolves.toBe(true);

        expect(tracker.history.update[0]?.bindings).toContain('retrying');
        expect(tracker.history.update[1]?.bindings).toContain('succeeded');
        expect(tracker.history.update[3]?.bindings).toContain('parked');
        expect(tracker.history.update[4]?.bindings).toEqual(
            expect.arrayContaining([
                identity.appVersion,
                '002_next.ts',
                'deterministic failure',
                'deterministic',
            ]),
        );
        expect(tracker.history.update[4]?.sql).toContain(
            '"parked_error_class" = ',
        );
    });

    test('an expired holder is taken over once and loses the re-race', async () => {
        handleBootstrap();
        tracker.on.update('migration_lease').responseOnce([]);
        handleInitializedSchema();
        tracker.on
            .select('migration_lease')
            .responseOnce([{ ...databaseRow('expired-token'), expired: true }]);
        tracker.on
            .update('migration_lease')
            .responseOnce([databaseRow('takeover-token')]);
        tracker.on.update('migration_lease').responseOnce([]);
        tracker.on
            .select('migration_lease')
            .responseOnce([
                { ...databaseRow('takeover-token'), expired: false },
            ]);

        const expired = await manager('first-racer').claim(
            identity,
            transientParkCooloffMs,
        );
        const takeover = await manager('takeover-token').claim(
            identity,
            transientParkCooloffMs,
        );
        const rerace = await manager('second-racer').claim(
            identity,
            transientParkCooloffMs,
        );

        expect(expired).toMatchObject({ status: 'held' });
        expect(takeover).toMatchObject({
            status: 'acquired',
            token: 'takeover-token',
        });
        expect(rerace).toMatchObject({
            status: 'held',
            token: null,
            lease: { claimToken: 'takeover-token' },
        });
    });

    test('a stale old token cannot heartbeat, update progress, or release', async () => {
        tracker.on.update('migration_lease').response([]);
        const leaseManager = manager('new-token');

        await expect(leaseManager.heartbeat('old-token')).resolves.toBe(false);
        await expect(
            leaseManager.setCurrentMigration(
                'old-token',
                '20260810120000_create_migration_lease.ts',
            ),
        ).resolves.toBe(false);
        await expect(leaseManager.release('old-token')).resolves.toBe(false);
        expect(tracker.history.update).toHaveLength(3);
        expect(
            tracker.history.update.every((query) =>
                query.bindings.includes('old-token'),
            ),
        ).toBe(true);
    });

    test('a long-running holder that keeps beating never reads as stale', async () => {
        const leaseManager = manager('claim-a');
        const heartbeatTimes = Array.from(
            { length: 241 },
            (_, index) => new Date(startedAt.getTime() + (index + 1) * 10_000),
        );
        heartbeatTimes.forEach((lastHeartbeat) => {
            tracker.on
                .update('migration_lease')
                .responseOnce([
                    { lease_key: 'global', last_heartbeat: lastHeartbeat },
                ]);
        });
        handleInitializedSchema();
        tracker.on.select('migration_lease').response([
            {
                ...databaseRow(
                    'claim-a',
                    heartbeatTimes[heartbeatTimes.length - 1] ?? startedAt,
                ),
                expired: false,
            },
        ]);
        expect(
            (heartbeatTimes[heartbeatTimes.length - 1] ?? startedAt).getTime() -
                startedAt.getTime(),
        ).toBeGreaterThan(40 * 60_000);

        await heartbeatTimes.reduce<Promise<void>>(
            async (previousHeartbeat, heartbeatTime) => {
                await previousHeartbeat;
                expect(
                    heartbeatTime.getTime() - startedAt.getTime(),
                ).toBeLessThanOrEqual(2_410_000);
                await expect(leaseManager.heartbeat('claim-a')).resolves.toBe(
                    true,
                );
            },
            Promise.resolve(),
        );
        const status = await leaseManager.read();

        expect(status).toMatchObject({
            initialized: true,
            lease: {
                claimToken: 'claim-a',
                expired: false,
            },
        });
    });

    test('unlock refuses a holder with a fresh heartbeat', async () => {
        handleBootstrap();
        tracker.on.update('migration_lease').responseOnce([]);
        handleInitializedSchema();
        tracker.on
            .select('migration_lease')
            .responseOnce([{ ...databaseRow('claim-a'), expired: false }]);

        const result = await manager('claim-a').unlock(
            'operator@example.com',
            false,
        );

        expect(result).toMatchObject({
            status: 'held',
            lease: {
                claimToken: 'claim-a',
                expired: false,
            },
        });
        expect(tracker.history.update[0]?.sql).toContain(
            '"last_heartbeat" <= CURRENT_TIMESTAMP',
        );
        expect(tracker.history.update[0]?.bindings).toContain(
            MIGRATION_LEASE_EXPIRY_MS,
        );
    });

    test('unlock clears an expired holder without force and records the actor', async () => {
        handleBootstrap();
        const unlockedAt = new Date('2026-08-10T10:01:00.000Z');
        tracker.on.update('migration_lease').responseOnce([
            {
                ...databaseRow(null),
                last_unlocked_by: 'operator@example.com',
                last_unlocked_at: unlockedAt,
            },
        ]);
        tracker.on.update('migration_lease').responseOnce([]);
        const leaseManager = manager('claim-a');

        const result = await leaseManager.unlock('operator@example.com', false);
        const staleHeartbeat = await leaseManager.heartbeat('claim-a');

        expect(result).toMatchObject({
            status: 'unlocked',
            lease: {
                claimToken: null,
                lastUnlockedBy: 'operator@example.com',
                lastUnlockedAt: unlockedAt,
            },
        });
        expect(tracker.history.update[0]?.sql).toContain(
            '"last_heartbeat" <= CURRENT_TIMESTAMP',
        );
        expect(staleHeartbeat).toBe(false);
    });

    test('unlock re-races with the expiry predicate when the lease becomes claimable', async () => {
        handleBootstrap();
        tracker.on.update('migration_lease').responseOnce([]);
        handleInitializedSchema();
        tracker.on
            .select('migration_lease')
            .responseOnce([{ ...databaseRow('claim-a'), expired: true }]);
        tracker.on.update('migration_lease').responseOnce([databaseRow(null)]);

        const result = await manager('claim-a').unlock(
            'operator@example.com',
            false,
        );

        expect(result.status).toEqual('unlocked');
        expect(tracker.history.update).toHaveLength(2);
        expect(
            tracker.history.update.every((query) =>
                query.sql.includes('"last_heartbeat" <= CURRENT_TIMESTAMP'),
            ),
        ).toBe(true);
    });

    test('unlock bounds repeated claimable re-races', async () => {
        handleBootstrap();
        tracker.on.update('migration_lease').response([]);
        handleInitializedSchema();
        tracker.on
            .select('migration_lease')
            .response([{ ...databaseRow('claim-a'), expired: true }]);

        await expect(
            manager('claim-a').unlock('operator@example.com', false),
        ).rejects.toThrow(
            'Migration lease changed repeatedly during unlock; retry the command',
        );

        expect(tracker.history.update).toHaveLength(3);
        expect(
            tracker.history.update.every((query) =>
                query.sql.includes('"last_heartbeat" <= CURRENT_TIMESTAMP'),
            ),
        ).toBe(true);
    });

    test('force unlock bypasses the fresh-heartbeat predicate', async () => {
        handleBootstrap();
        tracker.on.update('migration_lease').responseOnce([databaseRow(null)]);

        const result = await manager('claim-a').unlock(
            'operator@example.com',
            true,
        );

        expect(result.status).toEqual('unlocked');
        expect(tracker.history.update[0]?.sql).not.toContain(
            '"last_heartbeat" <= CURRENT_TIMESTAMP',
        );
    });
});
