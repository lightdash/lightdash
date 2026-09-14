import { runMigrations } from 'graphile-worker';
import knex from 'knex';
import os from 'node:os';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { lightdashConfig } from '../../config/lightdashConfig';
import { MigrationLeaseManager } from '../../database/migrationLease';
import knexConfig from '../../knexfile';
import { VERSION } from '../../version';
import {
    createMigrateCliContext,
    parseMigrationWaitTimeoutMs,
    runMigrateCli,
} from './cli';
import { createMigrateKnexConfig } from './config';
import { cleanupInvalidMigrationIndexes } from './invalidMigrationIndexes';
import { getKnexMigrationState } from './migrationState';
import {
    createKnexPreflightProbe,
    getPendingMigrationInventory,
    loadReleaseSafetyArtifact,
    parseDiskHeadroomBytes,
    resolveReleaseSafetyArtifactPath,
    runPreflight,
} from './preflight';
import { createUpgradeTelemetry } from './telemetry';

const environment =
    process.env.NODE_ENV === 'production' ? 'production' : 'development';
const config = createMigrateKnexConfig(knexConfig[environment]);
const defaultTimeoutMs = parseMigrationWaitTimeoutMs(
    process.env.MIGRATION_WAIT_TIMEOUT_MS,
);

const database = knex(config);
const heartbeatDatabase = knex({
    ...config,
    pool: {
        ...config.pool,
        min: 0,
        max: 1,
    },
});

const leaseManager = new MigrationLeaseManager({ database });
const heartbeatLeaseManager = new MigrationLeaseManager({
    database: heartbeatDatabase,
});

const { emitUpgradeEvent, flushUpgradeEvents } = createUpgradeTelemetry({
    lightdashConfig,
    analyticsFactory: () => {
        const { writeKey, dataPlaneUrl } = lightdashConfig.rudder;
        if (!writeKey || !dataPlaneUrl) {
            throw new Error('Upgrade analytics configuration is unavailable');
        }
        return new LightdashAnalytics({
            lightdashConfig,
            writeKey,
            dataPlaneUrl,
            options: { enable: true },
        });
    },
});

const flushAndExit = async (error: Error): Promise<void> => {
    console.error(`Migration command failed: ${error.message}`);
    await flushUpgradeEvents();
    process.exit(1);
};

type KnexMigrationLockRow = {
    is_locked: number;
};

const main = async (): Promise<void> => {
    const migrationConfig = config.migrations ?? {};
    const artifactPath = resolveReleaseSafetyArtifactPath();
    const context = createMigrateCliContext({
        leaseManager,
        heartbeatLeaseManager,
        identity: {
            hostname: process.env.HOSTNAME ?? os.hostname(),
            podName: process.env.K8S_POD_NAME ?? process.env.POD_NAME ?? null,
            appVersion: String(VERSION),
        },
        getMigrationState: () =>
            getKnexMigrationState(database, migrationConfig),
        runPreflight: async (options) => {
            const preflightProbe = createKnexPreflightProbe({
                database,
                diskHeadroomBytes: parseDiskHeadroomBytes(
                    process.env.MIGRATION_PREFLIGHT_DISK_HEADROOM_BYTES,
                ),
            });
            const [artifactLoad, migrationState] = await Promise.all([
                loadReleaseSafetyArtifact(artifactPath),
                getKnexMigrationState(database, migrationConfig),
            ]);
            const inventory = await getPendingMigrationInventory({
                migrationState,
                migrationConfig,
                artifact: artifactLoad.artifact,
            });
            return runPreflight({
                artifactLoad,
                migrationState,
                inventory,
                probe: preflightProbe,
                options,
            });
        },
        cleanupInvalidIndexes: async (pendingMigrationNames) => {
            await cleanupInvalidMigrationIndexes({
                database,
                migrationConfig,
                pendingMigrationNames,
                log: console.log,
            });
        },
        migrateOne: async (name) => {
            await database.migrate.up({ name });
        },
        isKnexLockHeld: async () => {
            if (!(await database.schema.hasTable('knex_migrations_lock'))) {
                return false;
            }
            const lock = await database<KnexMigrationLockRow>(
                'knex_migrations_lock',
            )
                .select('is_locked')
                .first();
            return lock?.is_locked === 1;
        },
        clearKnexLock: async () => {
            await database.migrate.forceFreeMigrationsLock();
        },
        runGraphileMigrations: async () => {
            await runMigrations({
                connectionString: lightdashConfig.database.connectionUri,
            });
        },
        emitUpgradeEvent,
        onLeaseLost: (error) => {
            void flushAndExit(error);
        },
        allowMissingMigrations: lightdashConfig.database.allowMissingMigrations,
        defaultTimeoutMs,
    });
    await runMigrateCli(process.argv.slice(2), context);
};

main()
    .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Migration command failed: ${message}`);
        process.exitCode = 1;
    })
    .finally(async () => {
        await flushUpgradeEvents();
        await Promise.all([database.destroy(), heartbeatDatabase.destroy()]);
    });
