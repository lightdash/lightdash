import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import {
    type UpgradeFailureClass,
    type UpgradeTelemetryEvent,
} from '../../analytics/upgradeTelemetryEvents';
import { type LightdashConfig } from '../../config/parseConfig';
import { MigrationLeaseLostError } from './heartbeat';
import { MigrationWaitTimeoutError } from './migrationWaitTimeoutError';

type UpgradeAnalyticsClient = {
    track: (event: UpgradeTelemetryEvent & { anonymousId: string }) => void;
    flushEvents: (timeoutMs?: number) => Promise<void>;
};

type CreateUpgradeTelemetryArguments = {
    lightdashConfig: LightdashConfig;
    analyticsFactory: () => UpgradeAnalyticsClient;
};

const sleep = async (durationMs: number): Promise<void> => {
    await new Promise<void>((resolve) => {
        setTimeout(resolve, durationMs);
    });
};

const getErrorProperty = (
    error: unknown,
    property: 'code' | 'name',
): unknown => {
    if (typeof error !== 'object' || error === null) {
        return undefined;
    }
    return Reflect.get(error, property);
};

const getPostgresErrorCode = (error: unknown): string | null => {
    const code = getErrorProperty(error, 'code');
    return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? code : null;
};

export const classifyUpgradeFailure = ({
    stage,
    error,
}: {
    stage: string;
    error: unknown;
}): UpgradeFailureClass => {
    if (error instanceof MigrationLeaseLostError) {
        return 'lease_lost';
    }
    if (error instanceof MigrationWaitTimeoutError) {
        return 'timeout_exceeded';
    }
    if (stage === 'migration-state') {
        return 'migration_state_invalid';
    }
    const postgresErrorCode = getPostgresErrorCode(error);
    if (postgresErrorCode === '55P03' || postgresErrorCode === '57014') {
        return 'lock_timeout';
    }
    if (postgresErrorCode === '08006' || postgresErrorCode === '08003') {
        return 'db_unreachable';
    }
    if (
        postgresErrorCode === '23505' ||
        postgresErrorCode === '23503' ||
        postgresErrorCode === '23502' ||
        postgresErrorCode === '23514'
    ) {
        return 'constraint_violation';
    }
    if (postgresErrorCode === '42501') {
        return 'permission_denied';
    }
    if (
        postgresErrorCode === '53100' ||
        postgresErrorCode === '53200' ||
        postgresErrorCode === '53300'
    ) {
        return 'resource_exhausted';
    }
    if (
        postgresErrorCode === '42601' ||
        postgresErrorCode === '42P01' ||
        postgresErrorCode === '42703'
    ) {
        return 'migration_defect';
    }
    if (getErrorProperty(error, 'name') === 'KnexTimeoutError') {
        return 'db_unreachable';
    }
    if (stage === 'graphile-worker') {
        return 'graphile_worker_failed';
    }
    return 'unclassified';
};

export const resolveExecutionMode = (env = process.env): string => {
    const executionMode =
        env.LIGHTDASH_MIGRATION_EXECUTION_MODE?.trim().toLowerCase();
    return executionMode !== undefined &&
        /^[a-z0-9_-]{1,32}$/.test(executionMode)
        ? executionMode
        : 'unknown';
};

export const createUpgradeTelemetry = ({
    lightdashConfig,
    analyticsFactory,
}: CreateUpgradeTelemetryArguments): {
    emitUpgradeEvent: (event: UpgradeTelemetryEvent) => void;
    flushUpgradeEvents: () => Promise<void>;
} => {
    if (
        !lightdashConfig.rudder.writeKey ||
        !lightdashConfig.rudder.dataPlaneUrl
    ) {
        return {
            emitUpgradeEvent: () => {},
            flushUpgradeEvents: async () => {},
        };
    }
    const analytics = analyticsFactory();
    return {
        emitUpgradeEvent: (event) => {
            try {
                analytics.track({
                    ...event,
                    anonymousId: LightdashAnalytics.anonymousId,
                });
            } catch {
                return;
            }
        },
        flushUpgradeEvents: async () => {
            try {
                await Promise.race([
                    analytics.flushEvents(3_000),
                    sleep(4_000),
                ]);
            } catch {
                return;
            }
        },
    };
};
