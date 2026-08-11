import { runMigrations } from 'graphile-worker';
import knex from 'knex';
import os from 'node:os';
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

type KnexMigrationLockRow = {
    is_locked: number;
};

const main = async (): Promise<void> => {
    const context = createMigrateCliContext({
        leaseManager,
        heartbeatLeaseManager,
        identity: {
            hostname: process.env.HOSTNAME ?? os.hostname(),
            podName: process.env.K8S_POD_NAME ?? process.env.POD_NAME ?? null,
            appVersion: String(VERSION),
        },
        getMigrationState: () =>
            getKnexMigrationState(database, config.migrations ?? {}),
        cleanupInvalidIndexes: async (pendingMigrationNames) => {
            await cleanupInvalidMigrationIndexes({
                database,
                migrationConfig: config.migrations ?? {},
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
        onLeaseLost: (error) => {
            console.error(`Migration command failed: ${error.message}`);
            process.exit(1);
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
        await Promise.all([database.destroy(), heartbeatDatabase.destroy()]);
    });
