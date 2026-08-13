import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import {
    type UpgradeFailureClass,
    type UpgradeTelemetryEvent,
} from '../../analytics/upgradeTelemetryEvents';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { type LightdashConfig } from '../../config/parseConfig';
import { MigrationWaitTimeoutError } from './cli';
import { MigrationLeaseLostError } from './heartbeat';
import {
    classifyUpgradeFailure,
    createUpgradeTelemetry,
    resolveExecutionMode,
} from './telemetry';

const config = (enabled: boolean): LightdashConfig => ({
    ...lightdashConfigMock,
    rudder: {
        ...lightdashConfigMock.rudder,
        writeKey: enabled ? 'write-key' : undefined,
        dataPlaneUrl: enabled ? 'https://analytics.example.com' : undefined,
    },
});

const event: UpgradeTelemetryEvent = {
    event: 'upgrade_started',
    properties: {
        migration_run_uuid: 'run-1',
        to_version: '1.2.3',
        from_version: '1.1.0',
        span_migrations: 2,
        execution_mode: 'compose',
        duration_seconds: null,
        attempt: 1,
        outcome: null,
        failure_class: null,
        failing_migration: null,
        preceded_by_unlock: false,
        preceding_unlock_forced: null,
        preflight_decision: null,
        preflight_red: null,
        preflight_yellow: null,
        preflight_blocked_checks: null,
    },
};

describe('classifyUpgradeFailure', () => {
    test.each<{
        expected: UpgradeFailureClass;
        stage: string;
        error: unknown;
    }>([
        {
            expected: 'lease_lost',
            stage: 'graphile-worker',
            error: Object.assign(new MigrationLeaseLostError(), {
                code: '23505',
            }),
        },
        {
            expected: 'timeout_exceeded',
            stage: 'waiting',
            error: new MigrationWaitTimeoutError(),
        },
        {
            expected: 'migration_state_invalid',
            stage: 'migration-state',
            error: { code: '23505' },
        },
        {
            expected: 'lock_timeout',
            stage: '001_first.ts',
            error: { code: '55P03' },
        },
        {
            expected: 'lock_timeout',
            stage: '001_first.ts',
            error: { code: '57014' },
        },
        {
            expected: 'db_unreachable',
            stage: '001_first.ts',
            error: { code: '08006' },
        },
        {
            expected: 'db_unreachable',
            stage: '001_first.ts',
            error: { name: 'KnexTimeoutError' },
        },
        {
            expected: 'constraint_violation',
            stage: '001_first.ts',
            error: { code: '23514' },
        },
        {
            expected: 'permission_denied',
            stage: '001_first.ts',
            error: { code: '42501' },
        },
        {
            expected: 'resource_exhausted',
            stage: '001_first.ts',
            error: { code: '53200' },
        },
        {
            expected: 'migration_defect',
            stage: 'graphile-worker',
            error: { code: '42P01' },
        },
        {
            expected: 'graphile_worker_failed',
            stage: 'graphile-worker',
            error: new Error('failed'),
        },
        {
            expected: 'unclassified',
            stage: '001_first.ts',
            error: { code: 'not-a-pg-code' },
        },
    ])('returns $expected', ({ expected, stage, error }) => {
        expect(classifyUpgradeFailure({ stage, error })).toBe(expected);
    });

    test('covers every classifier-produced failure class', () => {
        const expectedClasses: UpgradeFailureClass[] = [
            'preflight_blocked',
            'migration_state_invalid',
            'lease_lost',
            'lock_timeout',
            'db_unreachable',
            'constraint_violation',
            'permission_denied',
            'resource_exhausted',
            'graphile_worker_failed',
            'timeout_exceeded',
            'migration_defect',
            'unclassified',
        ];
        expect(expectedClasses).toHaveLength(12);
    });
});

describe('resolveExecutionMode', () => {
    test.each([
        [{}, 'unknown'],
        [{ LIGHTDASH_MIGRATION_EXECUTION_MODE: '' }, 'unknown'],
        [{ LIGHTDASH_MIGRATION_EXECUTION_MODE: '  COMPOSE  ' }, 'compose'],
        [{ LIGHTDASH_MIGRATION_EXECUTION_MODE: 'boot-winner' }, 'boot-winner'],
        [{ LIGHTDASH_MIGRATION_EXECUTION_MODE: 'bad value!' }, 'unknown'],
        [{ LIGHTDASH_MIGRATION_EXECUTION_MODE: 'a'.repeat(33) }, 'unknown'],
    ])('resolves %j to %s', (env, expected) => {
        expect(resolveExecutionMode(env)).toBe(expected);
    });
});

describe('createUpgradeTelemetry', () => {
    test('does not construct analytics when telemetry is disabled', async () => {
        const analyticsFactory = vi.fn();
        const telemetry = createUpgradeTelemetry({
            lightdashConfig: config(false),
            analyticsFactory,
        });

        telemetry.emitUpgradeEvent(event);
        await expect(telemetry.flushUpgradeEvents()).resolves.toBeUndefined();

        expect(analyticsFactory).not.toHaveBeenCalled();
    });

    test('tracks the full event with the install anonymous id', () => {
        const track = vi.fn();
        const flushEvents = vi.fn(async () => {});
        const telemetry = createUpgradeTelemetry({
            lightdashConfig: config(true),
            analyticsFactory: () => ({ track, flushEvents }),
        });

        telemetry.emitUpgradeEvent(event);

        expect(track).toHaveBeenCalledWith({
            ...event,
            anonymousId: LightdashAnalytics.anonymousId,
        });
    });

    test('caps a hanging analytics flush', async () => {
        vi.useFakeTimers();
        try {
            const track = vi.fn();
            const flushEvents = vi.fn(async () => new Promise<void>(() => {}));
            const telemetry = createUpgradeTelemetry({
                lightdashConfig: config(true),
                analyticsFactory: () => ({ track, flushEvents }),
            });

            const flushing = telemetry.flushUpgradeEvents();
            await vi.advanceTimersByTimeAsync(4_000);

            await expect(flushing).resolves.toBeUndefined();
            expect(flushEvents).toHaveBeenCalledWith(3_000);
        } finally {
            vi.useRealTimers();
        }
    });
});
