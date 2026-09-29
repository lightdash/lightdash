import knex, { type Knex } from 'knex';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { getAdminDatabase } from '../../../testing/migratedDatabase';

export type MigratedTestDatabase = {
    database: Knex;
    destroy: () => Promise<void>;
};

const connectionSettings = () => ({
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT ?? 5432),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
});

/**
 * `community` applies only the core migrations, the schema of a self-hosted
 * instance without an Enterprise license. The default follows the
 * environment, so a `LIGHTDASH_LICENSE_KEY` in the shell adds the EE tables.
 */
export type MigratedTestDatabaseEdition = 'community' | 'environment';

export const createMigratedTestDatabase = async (
    prefix: string,
    { edition = 'environment' }: { edition?: MigratedTestDatabaseEdition } = {},
): Promise<MigratedTestDatabase> => {
    const settings = connectionSettings();
    const databaseName = `${prefix}_${randomUUID().replaceAll('-', '')}`;
    const admin = knex({
        client: 'pg',
        connection: {
            ...settings,
            database: getAdminDatabase(),
        },
    });
    await admin.raw('CREATE DATABASE ??', [databaseName]);
    execFileSync('pnpm', ['migrate'], {
        cwd: process.cwd(),
        env: {
            ...process.env,
            PGCONNECTIONURI: `postgres://${encodeURIComponent(
                settings.user ?? '',
            )}:${encodeURIComponent(settings.password ?? '')}@${settings.host}:${
                settings.port
            }/${databaseName}`,
            ...(edition === 'community' ? { LIGHTDASH_LICENSE_KEY: '' } : {}),
        },
        stdio: 'pipe',
    });
    const database = knex({
        client: 'pg',
        connection: { ...settings, database: databaseName },
        pool: { min: 0, max: 6 },
    });
    return {
        database,
        destroy: async () => {
            await database.destroy();
            await admin.raw('DROP DATABASE IF EXISTS ?? WITH (FORCE)', [
                databaseName,
            ]);
            await admin.destroy();
        },
    };
};
